/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * GET /api/offerings — the ladder, for anyone: the plans, the modules with
 * their prices and what each includes, the starter packages per vertical,
 * the trial and the service fee, formatted by the server. No sign-in, no
 * tenant, no quote: a page reads it to show what is for sale and sends the
 * person to signup with a choice. The book is the seeded one when it is
 * there, else the proposed book in the repo, and the response says which.
 * Nothing here is confidential: it is the price list. */
'use strict';
var A = require('./_lib/admin'), B = require('./_lib/pricebook'), P = require('./_lib/subscription-pricing'), M = require('./_lib/modules');
async function book(db) {
  try { return { book: await B.load(db, B.VERSION), source: 'seeded' }; } catch (e) { return { book: B.proposed(), source: 'proposed' }; }
}
function view(b, source) {
  var rows = P.catalog(b), modules = rows.map(function (m) { return { key: m.key, name: m.name, category: m.category, monthlyDisplay: m.priceDisplay, usageDisplay: m.usageDisplay || '', features: m.features || [], requires: m.requires || [], tools: m.tools }; });
  var plans = Object.keys(b.plans).map(function (k) { var p = b.plans[k]; return { key: k, name: p.name, monthlyDisplay: P.money(p.priceCents) + '/month', capDisplay: 'À la carte up to ' + P.money(p.capCents) + ' of modules', serviceFeeDisplay: b.serviceFees[k] ? P.money(b.serviceFees[k]) + '/year' : 'Included' }; });
  return { pricebookVersion: b.version, source: source, currency: b.currency, floorDisplay: P.money(b.floorCents) + '/month',
    lite: { name: 'Lite', monthlyDisplay: P.money(b.modules.lite.priceCents) + '/month', serviceFeeDisplay: b.serviceFees.lite ? P.money(b.serviceFees.lite) + '/year' : 'Included' },
    plans: plans, enterprise: { annualFloorDisplay: P.money(b.enterprise.floorAnnualCents) + '/year', setupDisplay: P.money(b.enterprise.setupCents), devHoursMonthly: b.enterprise.devHoursMonthly, serviceFeeDisplay: P.money(b.serviceFees.enterprise) + '/year' },
    modules: modules, starters: M.starters(), starterLabels: M.starterLabels(),
    logins: { builders: b.logins.builders, viewers: b.logins.viewers, builderDisplay: P.money(b.logins.builderCents) + '/month', viewerDisplay: P.money(b.logins.viewerCents) + '/month' },
    trial: { days: Math.min(b.policy.trialDays, 14), note: 'One trial per company, at most 14 days, starting when ClearSky approves the request. Or pay now and start today.' },
    annual: { paidMonths: b.annualPaidMonths, freeMonths: 12 - b.annualPaidMonths, note: 'Pay for the year and you pay for ' + b.annualPaidMonths + ' months of twelve, invoiced once: ' + (12 - b.annualPaidMonths) + ' months free.' },
    signup: { packaged: process.env.PACKAGING_SIGNUP_ENABLED === 'true', payNow: process.env.PACKAGING_SIGNUP_ENABLED === 'true' && process.env.PACKAGING_BILLING_ENABLED === 'true', start: '/start.html' } };
}
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  var b = await book(A.db());
  return view(b.book, b.source);
});
module.exports.view = view;
