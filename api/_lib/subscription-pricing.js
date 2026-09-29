/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Pure server-only subscription math; every amount is integer USD cents.
 * Options containing negotiated terms come from trusted staff/billing data,
 * never from a customer's quote body. Tax remains QuickBooks' responsibility.
 */
'use strict';
var M = require('./modules'), B = require('./pricebook');
function fail(message) { var e = new Error(message); e.status = 400; throw e; }
function money(n) { return '$' + (n / 100).toLocaleString('en-US', { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }); }
function dollarsToCents(value, label) {
  if (typeof value === 'number') value = String(value);
  if (typeof value !== 'string' || !/^\d{1,7}(\.\d{1,2})?$/.test(value.trim())) fail((label || 'Amount') + ' must be dollars, like 999 or 999.50');
  var parts = value.trim().split('.'); return B.integer(Number(parts[0]) * 100 + Number(((parts[1] || '') + '00').slice(0, 2)), label || 'amount');
}
function dollarInput(value) {
  if (typeof value !== 'string' || !/^\d{1,8}(\.\d{1,2})?$/.test(value)) fail('Enter a dollar amount with at most two decimal places');
  var parts = value.split('.'); return B.integer(Number(parts[0]) * 100 + Number(((parts[1] || '') + '00').slice(0, 2)), 'custom service fee');
}
function fee(book, plan, choice, year) {
  choice = choice || { mode: 'standard' }; year = year || 1;
  var mode = choice.mode || 'standard', scope = choice.appliesTo || book.serviceFees.waiverScope;
  if (['standard', 'custom', 'waived'].indexOf(mode) < 0) fail('Invalid service fee mode');
  if (['first-year', 'every-year'].indexOf(scope) < 0) fail('Invalid service fee scope');
  if (mode !== 'standard' && (typeof choice.reason !== 'string' || !choice.reason.trim())) fail('A service fee reason is required');
  var standard = book.serviceFees[plan] == null ? book.serviceFees.lite : book.serviceFees[plan];
  var amount = mode === 'custom' ? B.integer(choice.amountCents, 'custom service fee') : (mode === 'waived' ? 0 : standard);
  if (year > 1 && scope === 'first-year') amount = standard;
  return { mode: mode, amountCents: amount, amountDollars: (amount / 100).toFixed(2), standardCents: standard, appliesTo: scope, reason: choice.reason || '', display: amount ? money(amount) + '/year' : 'Waived' };
}
function quote(keys, book, options) {
  B.validate(book); options = options || {};
  var interval = options.interval || 'monthly';
  if (['monthly', 'annual'].indexOf(interval) < 0) fail('Invalid billing interval');
  if (interval === 'annual' && options.credit && book.policy.annualTransformationCredit !== true) fail('Annual prepay excludes the transformation credit');
  var modules = M.normalize(keys), editor = 0, logic = 0, logicCount = 0, deliverables = 0, lines = [];
  modules.forEach(function (k) {
    var m = M.get(k), price = book.modules[k].priceCents;
    if (m.shelf === 'platform') { logic += price; logicCount++; }
    else if (k !== 'lite') editor += price;
    if (m.shelf === 'deliverable') deliverables++;
  });
  if (logicCount === 5) logic = book.logicBundle.priceCents;
  var list = book.modules.lite.priceCents + editor;
  var choices = [{ plan: 'alacarte', priceCents: list }];
  ['field', 'pro'].forEach(function (k) {
    var p = book.plans[k];
    if (editor <= p.capCents && deliverables <= p.maxDeliverables) choices.push({ plan: k, priceCents: p.priceCents });
  });
  var requested = options.plan || 'auto';
  /* A NEGOTIATED TIER PRICE (2026-09-28, Tommy: "the cost of the account
     should then reflect in the page in my admin console but i can override
     it if they are on a tier otherwise they pay for what they add"). Staff
     set a plan tier's monthly price by hand, with a reason; it replaces
     THAT tier's list price and nothing else: Omega Logic, extra logins, the
     credit and the floor stay as the book has them, and Lite + modules is
     never overridden — it pays for what it adds. The price names its tier;
     on any other plan it does not apply. It comes from the billing record
     or a staff body, never a customer's quote (api/package-catalog.js). */
  var po = options.priceOverride || null, override = null;
  if (po) {
    if (typeof po !== 'object') fail('Invalid negotiated price');
    var tier = po.plan || (requested !== 'auto' ? requested : null);
    if (!tier || tier === 'alacarte' || !book.plans[tier]) fail('A negotiated price applies to a plan tier (Field or Pro); Lite + modules pays for what it adds');
    var negotiatedCents = B.integer(po.amountCents, 'negotiated monthly price', book.floorCents);
    if (typeof po.reason !== 'string' || !po.reason.trim() || po.reason.length > 300) fail('A negotiated price needs a reason');
    choices.forEach(function (c) { if (c.plan === tier) { c.listCents = c.priceCents; c.priceCents = negotiatedCents; } });
    override = { plan: tier, amountCents: negotiatedCents, reason: po.reason.trim() };
  }
  choices.sort(function (a, b) { return a.priceCents - b.priceCents; });
  var chosen = choices[0];
  if (requested !== 'auto') {
    chosen = choices.filter(function (c) { return c.plan === requested; })[0];
    if (!chosen) fail('Selected modules do not fit this plan; quote Enterprise separately');
  }
  var negotiated = override && chosen.plan === override.plan ? Object.assign({}, override, { listCents: chosen.listCents }) : null;
  if (chosen.plan === 'alacarte') {
    modules.forEach(function (k) { if (M.get(k).shelf !== 'platform') lines.push({ itemKey: 'module:' + k, name: M.get(k).name, quantity: 1, amountCents: book.modules[k].priceCents }); });
  } else lines.push(Object.assign({ itemKey: 'plan:' + chosen.plan, name: book.plans[chosen.plan].name + (negotiated ? ' (negotiated)' : ''), quantity: 1, amountCents: chosen.priceCents, modules: modules.filter(function (k) { return M.get(k).shelf !== 'platform'; }) },
    negotiated ? { listCents: negotiated.listCents } : {}));
  if (logicCount === 5) lines.push({ itemKey: 'logic-bundle', name: book.logicBundle.name, quantity: 1, amountCents: logic });
  else modules.forEach(function (k) { if (M.get(k).shelf === 'platform') lines.push({ itemKey: 'module:' + k, name: M.get(k).name, quantity: 1, amountCents: book.modules[k].priceCents }); });
  var builders = options.builders == null ? book.logins.builders : B.integer(options.builders, 'builder logins');
  var viewers = options.viewers == null ? book.logins.viewers : B.integer(options.viewers, 'viewer logins');
  var extra = 0;
  [{ key: 'builder', count: Math.max(0, builders - book.logins.builders), price: book.logins.builderCents },
    { key: 'viewer', count: Math.max(0, viewers - book.logins.viewers), price: book.logins.viewerCents }].forEach(function (x) {
    if (!x.count) return; var amount = x.count * x.price; B.integer(amount, 'login amount'); extra += amount;
    lines.push({ itemKey: 'login:' + x.key, name: 'Additional ' + x.key + ' logins', quantity: x.count, unitCents: x.price, amountCents: amount });
  });
  var recurring = chosen.priceCents + logic + extra, creditCents = 0;
  B.integer(recurring, 'recurring amount', book.floorCents);
  if (options.credit) {
    var c = options.credit, start = Date.parse(c.startsAt), end = Date.parse(c.endsAt), now = options.now;
    if (!isFinite(start) || !isFinite(end) || end <= start || end - start > book.credit.days * 86400000 || typeof now !== 'number' || !isFinite(now)) fail('Credit requires a bounded window and server time');
    if (c.pct !== book.credit.pct) fail('Credit must match the signed price book');
    if (now >= start && now < end) creditCents = Math.min(Math.round(recurring * c.pct / 100), recurring - book.floorCents);
  }
  if (creditCents) lines.push({ itemKey: 'credit', name: 'Transformation credit', quantity: 1, amountCents: -creditCents });
  var monthly = recurring - creditCents;
  var service = fee(book, chosen.plan, options.serviceFee, options.year);
  return { pricebookVersion: book.version, modules: modules, plan: chosen.plan, interval: interval,
    editorListCents: editor, alacarteCents: list + logic + extra, logicCents: logic, loginCents: extra,
    recurringCents: recurring, creditCents: creditCents, monthlyCents: monthly,
    annualPrepayBeforeCreditCents: recurring * book.annualPaidMonths,
    serviceFee: service, lines: lines, grants: M.resolve(modules), priceOverride: negotiated,
    recommendation: { plan: choices[0].plan, monthlyCents: choices[0].priceCents + logic + extra,
      savingsCents: chosen.priceCents - choices[0].priceCents },
    display: { monthly: money(monthly) + '/month', recurring: money(recurring) + '/month', list: money(list + logic + extra) + '/month',
      plan: chosen.plan === 'alacarte' ? 'Lite + modules' : book.plans[chosen.plan].name,
      fit: chosen.plan === 'alacarte' ? (choices[0].plan !== 'alacarte' ? 'Switch to ' + book.plans[choices[0].plan].name + ' and save ' + money(chosen.priceCents - choices[0].priceCents) + '/month.' : 'Lite plus the modules selected is the lowest monthly price.') : money(book.plans[chosen.plan].capCents - editor) + ' of module capacity remains in ' + book.plans[chosen.plan].name + '.',
      usage: Object.keys(book.usage).filter(function (k) { return modules.indexOf(book.usage[k].module) >= 0; }).map(function (k) { return book.usage[k].included + ' ' + book.usage[k].name + '/cycle'; }),
      annualBeforeCredit: money(recurring * book.annualPaidMonths) + '/year; annual prepay excludes transformation credit', serviceFee: service.display,
      negotiated: negotiated ? 'Negotiated: ' + money(negotiated.amountCents) + '/month for ' + book.plans[negotiated.plan].name + ' (list ' + money(negotiated.listCents) + '/month). ' + negotiated.reason : null } };
}
function catalog(book) {
  return M.catalog().map(function (m) {
    m.priceCents = book.modules[m.key].priceCents; m.priceDisplay = money(m.priceCents) + '/month';
    m.usageDisplay = Object.keys(book.usage).filter(function (k) { return book.usage[k].module === m.key; })
      .map(function (k) { return book.usage[k].included + ' ' + book.usage[k].name + '/cycle'; }).join(' · ');
    return m;
  });
}
module.exports = { quote: quote, serviceFee: fee, money: money, catalog: catalog, dollarInput: dollarInput, dollarsToCents: dollarsToCents };
