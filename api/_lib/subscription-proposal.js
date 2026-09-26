/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Phase 6: the Subscription Proposal. A discovery conversation (VALUE-LADDER
 * §3.7) becomes a recommended package, a price from the ONE price book, the
 * value in the customer's own numbers, the terms, and the Agreement's Order
 * Form. Every figure is computed here; the pages only draw what comes back.
 * Records live in subscription_proposals/{id}, closed to browsers.
 */
'use strict';
var crypto = require('crypto');
var M = require('./modules'), P = require('./subscription-pricing'), Policy = require('./package-billing-policy');
function fail(message, status) { var e = new Error(message); e.status = status || 400; throw e; }
var VALID_DAYS = 30, INITIAL_TERM_MONTHS = 12, MAX_CENTS = 100000000, STATUSES = ['draft', 'sent', 'accepted', 'declined', 'expired'];
var ANSWERS = ['quarter', 'year', 'no'];
/* The twelve questions of §3.7. "This quarter" puts the module in the
 * starting package; "within the year" puts it on the next-rung list. */
var QUESTIONS = [
  { key: 'design', n: 1, text: 'Do you design sites (BESS, solar, EV, microgrid, data centre)?', adds: ['lite'], later: 'when you start designing sites' },
  { key: 'sites', n: 2, text: 'Do you find or screen your own sites or grid capacity?', adds: ['gridatlas'], later: 'when you start screening sites and grid capacity yourselves',
    more: [{ key: 'sitesMany', text: 'Many sites at a time', adds: ['siteintel'] }, { key: 'sitesIllinois', text: 'Northern Illinois C&I property', adds: ['sitefinder'] }] },
  { key: 'storage', n: 3, text: 'Do you size storage or model savings or revenue for a customer?', adds: ['storage'], later: 'when you size storage or model a customer’s savings' },
  { key: 'estimate', n: 4, text: 'Do you price jobs, build a BOM or buy the equipment?', adds: ['estimate'], later: 'when you price jobs or buy equipment' },
  { key: 'ev', n: 5, text: 'Do you file EV make-ready or rebate applications?', adds: ['evrebates'], later: 'when you file EV rebate applications', count: { key: 'evPerMonth', text: 'Applications a month' } },
  { key: 'plansets', n: 6, text: 'Do you submit drawings to a utility or an AHJ yourselves?', adds: ['plansets'], later: 'when you submit your own drawings' },
  { key: 'permitting', n: 7, text: 'Do you need permitting timelines, fees and a Gantt?', adds: ['permitting'], later: 'when a jurisdiction pack you need is verified', where: { key: 'permittingWhere', text: 'Where' } },
  { key: 'engineering', n: 8, text: 'Do you do electrical engineering in-house or pay for it?', adds: ['engineering'], later: 'when engineering moves in-house' },
  { key: 'finance', n: 9, text: 'Do you raise capital, sell to investors or need financing?', adds: ['finance'], later: 'when you take a project to investors or lenders' },
  { key: 'compute', n: 10, text: 'Do you build compute or data-centre sites?', adds: ['compute'], later: 'when you start on compute sites' },
  { key: 'ops', n: 11, text: 'Do you operate assets after COD?', adds: ['ops'], later: 'when your first assets are in service' },
  { key: 'sell', n: 12, text: 'Do you sell a product under your own name, take orders, build or ship?', adds: ['whitelabel'], later: 'when you sell under your own name',
    more: [{ key: 'sellOrders', text: 'Take orders and run an office', adds: ['logic-office'] }, { key: 'sellBuilds', text: 'Build units in a plant', adds: ['logic-plant'] },
      { key: 'sellParts', text: 'Buy parts and kit them', adds: ['logic-materials'] }, { key: 'sellShips', text: 'Ship, deliver and warrant', adds: ['logic-logistics'] },
      { key: 'sellApp', text: 'Customers track their orders', adds: ['logic-customer'] }] }
];
/* The money question: what they pay today, per month, for each of these. */
var SPEND = [{ key: 'tools', text: 'Software and tools' }, { key: 'consultants', text: 'Consultants and engineering' },
  { key: 'drafting', text: 'Drafting and CAD' }, { key: 'data', text: 'Data, screening and studies' }, { key: 'other', text: 'Other' }];
var UNIT_COSTS = [{ key: 'evApplications', text: 'per EV application today' }, { key: 'matrices', text: 'per permitting matrix today' }, { key: 'siteStudies', text: 'per site study today' }];
function str(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max || 200) : ''; }
function cents(v, name) {
  if (v == null || v === '') return 0;
  var n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*\d{1,9}(\.\d{1,2})?\s*$/.test(v) ? Number(v) : NaN);
  if (!isFinite(n) || n < 0) fail('Enter ' + name + ' as a dollar amount');
  var c = Math.round(n * 100); if (c > MAX_CENTS) fail(name + ' is out of range'); return c;
}
function count(v, name) {
  if (v == null || v === '') return null;
  var n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isInteger(n) || n < 0 || n > 100000) fail('Enter ' + name + ' as a whole number');
  return n;
}
function lower(v) { return str(v, 120).toLowerCase(); }
function domainOf(v) { var d = lower(v).replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, ''); return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : ''; }
function email(v) { var e = lower(v); return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) ? e : ''; }
/* ── the prospect ── */
function prospect(input) {
  input = input && typeof input === 'object' ? input : {};
  var company = str(input.company, 120); if (company.length < 2) fail('Company name is required');
  var type = str(input.type, 20); if (type && !M.starters()[type]) fail('Unknown customer type');
  var address = input.address && typeof input.address === 'object' ? input.address : {};
  return { company: company, domain: domainOf(input.domain), contactName: str(input.contactName, 120), email: email(input.email), phone: str(input.phone, 40), type: type,
    address: { line1: str(address.line1, 120), city: str(address.city, 80), state: str(address.state, 40), postalCode: str(address.postalCode, 20), country: str(address.country, 40) } };
}
/* ── discovery ── */
function discovery(input) {
  input = input && typeof input === 'object' ? input : {};
  var a = input.answers && typeof input.answers === 'object' ? input.answers : {}, answers = {}, flags = {}, given = input.flags && typeof input.flags === 'object' ? input.flags : {};
  QUESTIONS.forEach(function (q) {
    var v = a[q.key] == null ? 'no' : a[q.key];
    if (ANSWERS.indexOf(v) < 0) fail('Answer "' + q.key + '" with quarter, year or no');
    answers[q.key] = v;
    (q.more || []).forEach(function (m) { flags[m.key] = given[m.key] === true; });
  });
  var spend = {}, givenSpend = input.spend && typeof input.spend === 'object' ? input.spend : {};
  SPEND.forEach(function (s) { spend[s.key] = cents(givenSpend[s.key], s.text); });
  var unitCosts = {}, givenUnits = input.unitCosts && typeof input.unitCosts === 'object' ? input.unitCosts : {};
  UNIT_COSTS.forEach(function (u) { unitCosts[u.key] = givenUnits[u.key] == null || givenUnits[u.key] === '' ? null : cents(givenUnits[u.key], u.text); });
  return { answers: answers, flags: flags, evPerMonth: count(input.evPerMonth, 'applications a month'), permittingWhere: str(input.permittingWhere, 120),
    spend: spend, unitCosts: unitCosts, paysToday: str(input.paysToday, 600), heard: str(input.heard, 1200) };
}
/* Answers → the starting package and the next rungs. Always ≥ Lite; the
 * floor and the fit are the price book's, enforced when the package is priced. */
function recommend(d, book) {
  var modules = ['lite'], next = [], notes = [];
  function add(k) { if (modules.indexOf(k) < 0) modules.push(k); }
  function later(k, q) { if (modules.indexOf(k) < 0 && !next.some(function (n) { return n.module === k; })) next.push({ module: k, name: M.get(k).name, trigger: q.later }); }
  QUESTIONS.forEach(function (q) {
    var v = d.answers[q.key], keys = q.adds.slice();
    (q.more || []).forEach(function (m) { if (d.flags[m.key]) keys = keys.concat(m.adds); });
    if (v === 'quarter') keys.forEach(add); else if (v === 'year') keys.forEach(function (k) { later(k, q); });
  });
  if (modules.some(function (k) { return M.get(k).requires.indexOf('logic-office') >= 0; })) add('logic-office');
  next = next.filter(function (n) { return modules.indexOf(n.module) < 0; });
  var ev = book.usage.evApplications;
  if (d.evPerMonth != null && modules.indexOf('evrebates') >= 0 && d.evPerMonth > ev.included) {
    notes.push(d.evPerMonth + ' EV applications a month: ' + ev.included + ' are included each cycle; the rest are billed as overage at ' + P.money(ev.overageCents) + ' each, or bought as a pack of ' + ev.packUnits + ' for ' + P.money(ev.packCents) + '.');
  }
  if (modules.indexOf('permitting') >= 0) notes.push('Permitting Matrix is BETA. ' + M.get('permitting').coverage + (d.permittingWhere ? ' Asked for: ' + d.permittingWhere + '.' : ''));
  if (modules.indexOf('sitefinder') >= 0) notes.push('Site Finder: ' + M.get('sitefinder').coverage);
  if (modules.indexOf('whitelabel') >= 0) notes.push('White Label Storefront: ' + M.get('whitelabel').agreement + '.');
  return { modules: M.normalize(modules), next: next, notes: notes };
}
/* ── the rep's selection, validated by the same terms() activation uses ── */
function selection(input, book, now) {
  input = input && typeof input === 'object' ? input : {};
  var fee = { mode: 'standard', appliesTo: book.serviceFees.waiverScope };
  if (input.serviceFee && typeof input.serviceFee === 'object') {
    fee = { mode: str(input.serviceFee.mode, 20) || 'standard', appliesTo: str(input.serviceFee.appliesTo, 20) || book.serviceFees.waiverScope, reason: str(input.serviceFee.reason, 300) };
    if (fee.mode === 'custom') fee.amountDollars = input.serviceFee.amountDollars == null ? '' : String(input.serviceFee.amountDollars).trim();
  }
  var raw = { modules: input.modules, plan: str(input.plan, 12) || 'auto', interval: str(input.interval, 12) || 'monthly', credit: input.credit === true, serviceFee: fee,
    builders: input.builders == null ? book.logins.builders : count(input.builders, 'builder logins'), viewers: input.viewers == null ? book.logins.viewers : count(input.viewers, 'viewer logins') };
  if (['auto', 'alacarte', 'field', 'pro'].indexOf(raw.plan) < 0) fail('Invalid plan');
  var selected = Policy.terms(raw, book, now);
  return { input: raw, selected: selected };
}
function usageOf(book, modules) {
  return Object.keys(book.usage).filter(function (k) { return modules.indexOf(book.usage[k].module) >= 0; }).map(function (k) {
    var u = book.usage[k];
    return { key: k, module: u.module, name: u.name, included: u.included, overageCents: u.overageCents, overageDisplay: P.money(u.overageCents) + ' each',
      packUnits: u.packUnits, packCents: u.packCents, packDisplay: u.packUnits + ' for ' + P.money(u.packCents) };
  });
}
/* Everything on the price page comes from P.quote on the signed price book. */
function pricing(sel, book, now) {
  var s = sel.selected, q = P.quote(s.modules, book, { plan: s.plan, builders: s.builders, viewers: s.viewers, serviceFee: s.serviceFee, credit: s.credit, interval: s.interval, now: now });
  var plan = q.plan === 'alacarte' ? null : book.plans[q.plan];
  return { pricebookVersion: book.version, plan: q.plan, planDisplay: q.display.plan,
    planRule: plan ? 'Lite + up to ' + P.money(plan.capCents) + ' of modules' + (plan.maxDeliverables ? ', at most ' + plan.maxDeliverables + ' Deliverable module' : '') : 'Lite + each module at its list price',
    interval: s.interval, lines: q.lines, listCents: q.alacarteCents, recurringCents: q.recurringCents, creditCents: q.creditCents, monthlyCents: q.monthlyCents,
    savingsVsListCents: q.alacarteCents - q.recurringCents, annualPrepayCents: q.annualPrepayBeforeCreditCents, annualSavesCents: q.recurringCents * 12 - q.annualPrepayBeforeCreditCents,
    serviceFee: q.serviceFee, usage: usageOf(book, s.modules),
    logins: { builders: s.builders, viewers: s.viewers, includedBuilders: book.logins.builders, includedViewers: book.logins.viewers, extraBuilderCents: book.logins.builderCents, extraViewerCents: book.logins.viewerCents, extraCents: q.loginCents },
    credit: s.credit ? { pct: book.credit.pct, days: book.credit.days, monthlyCents: q.creditCents } : null, recommendation: q.recommendation,
    display: { list: P.money(q.alacarteCents) + '/month', recurring: P.money(q.recurringCents) + '/month', monthly: q.display.monthly,
      first: s.credit ? P.money(q.monthlyCents) + '/month for the first ' + book.credit.days + ' days' : null,
      annual: P.money(q.annualPrepayBeforeCreditCents) + '/year', serviceFee: q.serviceFee.display, fit: q.display.fit, usage: q.display.usage,
      savingsVsList: q.alacarteCents > q.recurringCents ? P.money(q.alacarteCents - q.recurringCents) + '/month less than the same modules one by one' : null } };
}
/* The value page: their numbers against ours. Nothing is invented; a figure
 * they did not give is not shown. */
function value(d, pr) {
  var spend = 0, byCategory = SPEND.map(function (s) { spend += d.spend[s.key]; return { key: s.key, text: s.text, cents: d.spend[s.key], display: P.money(d.spend[s.key]) + '/month' }; });
  var usage = pr.usage.map(function (u) {
    var unit = d.unitCosts[u.key], worth = unit == null ? null : unit * u.included;
    return { key: u.key, module: u.module, name: u.name, included: u.included, unitCostCents: unit, valueCents: worth,
      display: worth == null ? null : u.included + ' ' + u.name + ' a cycle, worth ' + P.money(worth) + ' at the ' + P.money(unit) + ' you pay for each today' };
  });
  var usageValue = usage.reduce(function (n, u) { return n + (u.valueCents || 0); }, 0), delta = spend - pr.recurringCents;
  return { spendTodayCents: spend, byCategory: byCategory, oursCents: pr.recurringCents, oursFirstCents: pr.monthlyCents, deltaCents: delta, yearlyDeltaCents: delta * 12,
    usage: usage, usageValueCents: usageValue, paysToday: d.paysToday, heard: d.heard,
    display: { spendToday: P.money(spend) + '/month', ours: P.money(pr.recurringCents) + '/month', oursFirst: pr.display.first,
      delta: spend ? (delta >= 0 ? P.money(delta) + '/month less than today' : P.money(-delta) + '/month more than today') : null,
      yearly: spend ? (delta >= 0 ? P.money(delta * 12) + ' a year' : P.money(-delta * 12) + ' a year more') : null,
      quarterly: spend ? P.money(Math.abs(delta) * 3) + ' a quarter' : null,
      usageValue: usageValue ? P.money(usageValue) + ' of included work each cycle at your current unit costs' : null } };
}
function terms(sel, pr, book, now) {
  var s = sel.selected;
  return { initialTermMonths: INITIAL_TERM_MONTHS, interval: s.interval,
    election: s.interval === 'annual' ? 'Annual prepay: ' + P.money(pr.annualPrepayCents) + ' for twelve months, invoiced once (' + book.annualPaidMonths + ' months for 12; no transformation credit)' : 'Monthly, invoiced in QuickBooks on your billing date; pay by card or ACH from the invoice',
    billingDate: 'Your billing date is the day of the month you sign up. The first invoice is prorated to it.',
    trial: 'One trial of at most ' + book.policy.trialDays + ' days from approval, running this package. Payment is required to continue after it.',
    credit: pr.credit ? P.money(pr.credit.monthlyCents) + '/month off for the first ' + pr.credit.days + ' days (' + pr.credit.pct + '% of the subscription, never below ' + P.money(book.floorCents) + ')' : 'No transformation credit',
    serviceFee: 'Annual service fee: ' + pr.serviceFee.display + (pr.serviceFee.mode === 'waived' ? ' (waived for the ' + (pr.serviceFee.appliesTo === 'every-year' ? 'life of the agreement' : 'first year') + ')' : pr.serviceFee.mode === 'custom' ? ' (custom)' : ''),
    addRemove: 'Add a module any time from inside the product, paid first and prorated to your billing date. Remove at the quarterly right-size review. Unit prices hold for the Initial Term.',
    usage: pr.usage.map(function (u) { return u.included + ' ' + u.name + ' included each cycle; more at ' + u.overageDisplay + ' or a pack of ' + u.packDisplay; }),
    logins: pr.logins.builders + ' builder and ' + pr.logins.viewers + ' viewer logins included; extra builders ' + P.money(pr.logins.extraBuilderCents) + '/month, extra viewers ' + P.money(pr.logins.extraViewerCents) + '/month',
    validDays: VALID_DAYS, pricebookVersion: book.version, agreement: 'ClearSky-OMEGA Subscription Agreement (Tier and Module Scope; Inaugural Pricing for the Initial Term)' };
}
/* The Agreement's Order Form, filled in. Drawn by the page, computed here. */
function orderForm(rec, book) {
  var pr = rec.pricing, p = rec.prospect, lite = book.modules.lite.priceCents;
  var schedule = rec.selection.modules.map(function (k) {
    var m = M.get(k), u = pr.usage.filter(function (x) { return x.module === k; })[0];
    return { module: k, name: m.name, shelf: m.shelf, unitCents: book.modules[k].priceCents, unitDisplay: P.money(book.modules[k].priceCents) + '/month',
      included: u ? u.included + ' ' + u.name + '/cycle' : '', overage: u ? u.overageDisplay : '', features: m.features || [] };
  });
  return { title: 'Order Form', agreement: rec.terms.agreement, pricebookVersion: book.version, date: rec.sentAt || rec.updatedAt || rec.createdAt,
    customer: { company: p.company, domain: p.domain, contactName: p.contactName, email: p.email, phone: p.phone, address: p.address },
    supplier: rec.sender && rec.sender.brand ? rec.sender.brand.name : 'ClearSky Energy Solutions LLC',
    lite: { name: 'Lite (Site Map core)', unitCents: lite, unitDisplay: P.money(lite) + '/month' },
    plan: pr.plan === 'alacarte' ? { key: 'alacarte', name: 'Lite + modules (à la carte)', rule: pr.planRule, monthlyDisplay: pr.display.recurring } : { key: pr.plan, name: book.plans[pr.plan].name, rule: pr.planRule, monthlyDisplay: pr.display.recurring },
    schedule: schedule, lines: pr.lines.map(function (l) { return { itemKey: l.itemKey, name: l.name, quantity: l.quantity, amountCents: l.amountCents, display: P.money(l.amountCents), modules: l.modules || null }; }),
    logins: { builders: pr.logins.builders, viewers: pr.logins.viewers, extraBuilder: P.money(pr.logins.extraBuilderCents) + '/month each', extraViewer: P.money(pr.logins.extraViewerCents) + '/month each' },
    credit: pr.credit ? { pct: pr.credit.pct, days: pr.credit.days, monthlyDisplay: '−' + P.money(pr.credit.monthlyCents) + '/month' } : null,
    serviceFee: { mode: pr.serviceFee.mode, display: pr.serviceFee.display, appliesTo: pr.serviceFee.appliesTo, reason: pr.serviceFee.reason || '' },
    totals: { listMonthly: pr.display.list, monthly: pr.display.recurring, credit: pr.credit ? '−' + P.money(pr.credit.monthlyCents) + '/month' : null, first: pr.display.first, annualPrepay: pr.interval === 'annual' ? pr.display.annual : null },
    term: { initialTermMonths: rec.terms.initialTermMonths, election: rec.terms.election, validUntil: rec.acceptance && rec.acceptance.validUntil ? new Date(rec.acceptance.validUntil).toISOString().slice(0, 10) : null },
    signatures: [{ party: 'Customer: ' + p.company, name: p.contactName || '', title: '', date: '' }, { party: rec.sender && rec.sender.brand ? rec.sender.brand.name : 'ClearSky Energy Solutions LLC', name: rec.sender ? rec.sender.name || '' : '', title: '', date: '' }] };
}
/* The whole record, recomputed from its inputs against the book. */
function compose(record, book, now) {
  var d = discovery(record.discovery), rec = recommend(d, book), p = prospect(record.prospect);
  var chosen = record.selection && Array.isArray(record.selection.modules) ? record.selection : { modules: rec.modules };
  var sel = selection(chosen, book, now), pr = pricing(sel, book, now);
  var out = Object.assign({}, record, { prospect: p, discovery: d, recommendation: rec, selection: sel.input, pricing: pr, value: value(d, pr),
    terms: terms(sel, pr, book, now), notes: str(record.notes, 2000), pricebookVersion: book.version, composedAt: now });
  out.orderForm = orderForm(out, book);
  return out;
}
/* ── identity, keys and the status machine ── */
function newId() { return 'sp-' + crypto.randomBytes(8).toString('hex'); }
function token() { return crypto.randomBytes(24).toString('hex'); }
function hashKey(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }
function verifyKey(record, key) {
  if (typeof key !== 'string' || !/^[a-f0-9]{48}$/.test(key) || !record || !record.acceptance || !record.acceptance.keyHash) return false;
  var a = Buffer.from(hashKey(key)), b = Buffer.from(String(record.acceptance.keyHash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function expired(record, now) { return record.status === 'sent' && !!(record.acceptance && record.acceptance.validUntil) && now > record.acceptance.validUntil; }
function transition(record, to, now) {
  var from = record.status, ok = { draft: ['sent'], sent: ['draft', 'accepted', 'declined', 'expired'] };
  if (STATUSES.indexOf(to) < 0) fail('Unknown status');
  if (!ok[from] || ok[from].indexOf(to) < 0) fail('A ' + from + ' proposal cannot become ' + to, 409);
  if (to === 'accepted' && expired(record, now)) fail('This proposal expired on ' + new Date(record.acceptance.validUntil).toISOString().slice(0, 10), 409);
}
/* What each audience may see. The customer never sees the rep's notes, the
 * key hash or the internal history. */
function projection(record, audience) {
  var out = Object.assign({}, record);
  if (audience === 'customer') {
    delete out.notes; delete out.history; delete out.createdBy; delete out.updatedBy;
    if (out.acceptance) { out.acceptance = Object.assign({}, out.acceptance); delete out.acceptance.keyHash; }
    if (out.sender) out.sender = { name: out.sender.name || '', email: out.sender.email || '', brand: out.sender.brand || null };
  } else if (out.acceptance) { out.acceptance = Object.assign({}, out.acceptance); delete out.acceptance.keyHash; }
  return out;
}
function summaryRow(r) {
  return { id: r.id, status: r.status, company: r.prospect ? r.prospect.company : '', domain: r.prospect ? r.prospect.domain : '', planDisplay: r.pricing ? r.pricing.planDisplay : '',
    monthlyDisplay: r.pricing ? r.pricing.display.recurring : '', createdAt: r.createdAt, updatedAt: r.updatedAt, sentAt: r.sentAt || null,
    validUntil: r.acceptance && r.acceptance.validUntil ? r.acceptance.validUntil : null, acceptedAt: r.acceptance && r.acceptance.acceptedAt ? r.acceptance.acceptedAt : null };
}
module.exports = { QUESTIONS: QUESTIONS, ANSWERS: ANSWERS, SPEND: SPEND, UNIT_COSTS: UNIT_COSTS, STATUSES: STATUSES, VALID_DAYS: VALID_DAYS, INITIAL_TERM_MONTHS: INITIAL_TERM_MONTHS,
  prospect: prospect, discovery: discovery, recommend: recommend, selection: selection, pricing: pricing, value: value, terms: terms, orderForm: orderForm, compose: compose,
  newId: newId, token: token, hashKey: hashKey, verifyKey: verifyKey, expired: expired, transition: transition, projection: projection, summaryRow: summaryRow };
