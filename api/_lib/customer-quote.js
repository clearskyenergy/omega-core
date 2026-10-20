/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   ═══════════════════════════════════════════════════════════════════════════
   api/_lib/customer-quote.js — a seller's quote to ITS customer, from an
   Omega Prime project (the battery, the map, the Run), and what each
   audience may see of it.

   PURE. No Firestore, no network, no clock it is not handed. The door is
   api/customer-quote.js; records are customer_quotes/{qt-<16 hex>}, Admin SDK
   only. The pattern is the Subscription Proposal's (api/_lib/
   subscription-proposal.js): a key minted per send and stored only as its
   sha256, a customer view built KEY BY KEY, editing what was sent withdraws
   it (the customer approves only what they saw), expiry flipped on read.

   ── THE MONEY ───────────────────────────────────────────────────────────
   The COST is the cost model's installed total for the project's own
   layout and battery, priced on the server (api/price-site.js, the same
   engine the Run calls; the door does that). The SELL price is that cost
   with the rep's markup, or a total the rep types. Margin is computed here.
   A total in a request body is never read: compose() takes the cost the
   server produced and the rep's pricing CHOICE, nothing else.

   ── WHAT THE CUSTOMER NEVER SEES ────────────────────────────────────────
   The cost (divisions, markups, supplier, sourcing, subtotal, per-kW), the
   margin and markup, the key hash, the history, who created or edited it,
   any ip hash, internal notes, the value stack. customerView() names every
   key it returns, so a field added to the record later stays inside.
   scripts/test-customer-quote.js poisons a record and searches the output.

   ── THE BATTERY LINE ────────────────────────────────────────────────────
   The battery is the manufacturer's to price (Tommy, 2026-10-17): its line
   reads "Quoted by <manufacturer>" and carries no figure of its own. The
   total includes it at the cost model's planning figure, and the price
   note says the manufacturer confirms it when the order is placed.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto');
/* the ONE battery list (browser files, CommonJS-exported; pure) */
var PP = require('../../omega-prime-project.js'), CC = require('../../omega-cleancell-catalog.js'), BP = require('../../omega-bess-products.js');

var VALID_DAYS = 30, MAX_VALID_DAYS = 180, MAX_MARKUP_PCT = 400, MAX_TOTAL_USD = 1000000000, DAY_MS = 86400000;
/* QUESTION_CAP is per SEND (a resend opens ten more); the TEXT of every
   question is kept on the record, the last QUESTIONS_KEPT of them, through
   every edit and resend: an edit or a new link never erases what the
   customer asked. */
var QUESTION_CAP = 10, QUESTIONS_KEPT = 20, PER_QUOTE_DAY = 5, PER_ORG_DAY = 50;
var STATUSES = ['draft', 'sent', 'viewed', 'approved', 'declined', 'expired', 'withdrawn'];
/* what can still be saved (and so sent): everything but an approved quote,
   which is final — a change is a new quote. Only these can be stale. */
var CHANGEABLE = ['draft', 'sent', 'viewed', 'expired', 'declined', 'withdrawn'];
/* from → the statuses it may become. A sent or viewed quote returns to
   draft when it is edited; sent → sent is a resend (a new key). */
var MOVES = {
  draft: ['sent', 'withdrawn'],
  sent: ['draft', 'sent', 'viewed', 'approved', 'declined', 'expired', 'withdrawn'],
  viewed: ['draft', 'sent', 'approved', 'declined', 'expired', 'withdrawn'],
  expired: ['draft', 'sent', 'withdrawn'],
  declined: ['draft'],
  withdrawn: ['draft'],
  approved: []
};
var DEFAULT_EXCLUSIONS = ['Utility-side upgrades the utility’s interconnection study requires', 'Sales and use taxes', 'Unforeseen subsurface or site conditions'];
/* the cost model's divisions → the three lines a customer reads */
var GROUPS = { eq: 'equipment', cv: 'installation', el: 'installation', cm: 'installation', en: 'engineering', pm: 'engineering' };

function fail(message, status) { var e = new Error(message); e.status = status || 400; throw e; }
function str(v, max) { return typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max || 200) : ''; }
function para(v, max) { return typeof v === 'string' ? v.replace(/\r/g, '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim().slice(0, max || 2000) : ''; }
function num(v) { var n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() ? Number(v) : NaN); return isFinite(n) ? n : null; }
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function email(v) { var e = str(v, 254).toLowerCase(); return /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[a-z]{2,}$/.test(e) ? e : ''; }
function hex(v) { var s = str(v, 16); return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : null; }
function cents(usd) { return Math.round(Number(usd) * 100); }
function iso(ms) { return typeof ms === 'number' && isFinite(ms) ? new Date(ms).toISOString() : null; }
/* Whole dollars when the figure is whole, else cents: '$1,234,567' */
function money(c) {
  if (typeof c !== 'number' || !isFinite(c)) return null;
  var whole = c % 100 === 0, v = c / 100;
  return (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
}
function n0(v) { var n = num(v); return n == null ? '' : n.toLocaleString('en-US', { maximumFractionDigits: n < 100 ? 1 : 0 }); }

/* ── what the rep types ───────────────────────────────────────────────── */
function customer(input) {
  input = isObj(input) ? input : {};
  var a = isObj(input.address) ? input.address : {};
  var out = { name: str(input.name, 120), company: str(input.company, 160), email: '', phone: str(input.phone, 40),
    address: { line1: str(a.line1, 200), city: str(a.city, 100), state: str(a.state, 40), zip: str(a.zip, 20) } };
  if (input.email != null && input.email !== '') { out.email = email(input.email); if (!out.email) fail('Enter the customer’s email address as name@company.com'); }
  if (out.phone && !/^[0-9+()\-.\s x#]+$/i.test(out.phone)) fail('Enter the customer’s phone number with digits only');
  if (out.name.length < 2 && out.company.length < 2) fail('Name the customer: a contact name or a company');
  return out;
}
function pricing(input) {
  input = isObj(input) ? input : {};
  var mode = input.mode == null ? 'markup' : input.mode;
  if (mode !== 'markup' && mode !== 'total') fail('Pricing mode must be markup or total');
  var out = { mode: mode, markupPct: 0, totalUsd: null, showGroupPrices: input.showGroupPrices === true };
  if (mode === 'markup') {
    var pct = input.markupPct == null || input.markupPct === '' ? 0 : num(input.markupPct);
    if (pct == null || pct < 0 || pct > MAX_MARKUP_PCT) fail('Markup must be 0–' + MAX_MARKUP_PCT + '%');
    out.markupPct = Math.round(pct * 100) / 100;
  } else {
    var t = num(input.totalUsd);
    if (t == null || !(t > 0) || t > MAX_TOTAL_USD) fail('Enter the customer’s total price in dollars');
    out.totalUsd = Math.round(t * 100) / 100;
  }
  return out;
}
function terms(input) {
  input = isObj(input) ? input : {};
  var days = input.validDays == null || input.validDays === '' ? VALID_DAYS : num(input.validDays);
  if (days == null || days !== Math.floor(days) || days < 1 || days > MAX_VALID_DAYS) fail('A quote is valid for 1–' + MAX_VALID_DAYS + ' days');
  var ex = DEFAULT_EXCLUSIONS.slice();
  if (input.exclusions != null) {
    if (!Array.isArray(input.exclusions) || input.exclusions.length > 10) fail('List up to 10 exclusions');
    ex = input.exclusions.map(function (x) { return str(x, 200); }).filter(Boolean);
  }
  return { validDays: days, paymentTerms: str(input.paymentTerms, 400), notes: para(input.notes, 2000), exclusions: ex };
}

/* ── the cost, from the server's price-site answer (INTERNAL) ──────────── */
function costOf(answer, input) {
  answer = answer || {};
  var t = answer.total || {}, sub = answer.subtotal || {};
  if (!(typeof t.base === 'number' && t.base > 0)) fail('The cost model returned no total for this site', 500);
  var divisions = (Array.isArray(answer.divisions) ? answer.divisions : []).map(function (d) { return { id: str(d.id, 20), name: str(d.name, 120), baseCents: cents(d.base || 0) }; });
  return { pricedBy: str(answer.pricedBy, 60) || 'api/price-site', at: str(answer.at, 40), input: input || null,
    totalCents: { lo: cents(t.lo), base: cents(t.base), hi: cents(t.hi) }, subtotalCents: cents(sub.base || 0),
    upgradeCents: answer.upgradeLine && answer.upgradeLine.cost ? cents(answer.upgradeLine.cost) : 0,
    divisions: divisions, estimateClass: str(answer.estimateClass, 60), estimateClassPlain: str(answer.estimateClassPlain, 300),
    supplierNote: str(answer.supplierNote, 300) };
}

/* ── cost × the rep's choice → the sell price, the margin, the lines ───── */
function sellOf(cost, p) {
  var base = cost.totalCents.base, sell = p.mode === 'total' ? cents(p.totalUsd) : Math.round(base * (1 + p.markupPct / 100) / 100) * 100;
  var margin = sell - base;
  /* the three customer lines carry the sell price in proportion to the cost
     behind them (markups and the utility allowance included), the last line
     taking the rounding so they add up exactly */
  var shares = { equipment: 0, installation: 0, engineering: cost.upgradeCents || 0 };
  cost.divisions.forEach(function (d) { var g = Object.prototype.hasOwnProperty.call(GROUPS, d.id) ? GROUPS[d.id] : 'installation'; shares[g] += d.baseCents; });
  var keys = ['equipment', 'installation', 'engineering'], whole = shares.equipment + shares.installation + shares.engineering, given = 0;
  /* the rounding goes to the LARGEST line, so a line with no cost behind it
     stays exactly $0 (and is then never printed: scope() sends null) */
  var big = keys.reduce(function (b, k) { return shares[k] > shares[b] ? k : b; }, 'equipment');
  var groups = keys.map(function (k) {
    var c = k === big ? 0 : (whole > 0 ? Math.round(sell * shares[k] / whole / 100) * 100 : 0);
    given += c; return { key: k, sellCents: c };
  });
  groups[keys.indexOf(big)].sellCents = sell - given;
  return { mode: p.mode, markupPct: p.mode === 'markup' ? p.markupPct : null, totalUsd: p.mode === 'total' ? p.totalUsd : null, showGroupPrices: p.showGroupPrices,
    sellCents: sell, marginCents: margin, marginPct: sell > 0 ? Math.round(margin / sell * 1000) / 10 : null,
    effectiveMarkupPct: base > 0 ? Math.round((sell / base - 1) * 1000) / 10 : null, groups: groups };
}

/* ── the workspace's battery list, from its records ───────────────────── */
/* The workspace's own products as OmegaBessProducts.load() resolves them in
   a browser, from the records the Admin SDK read: its pure builder when the
   file exports one, else load()'s own steps on its own exported pieces.
   The door prices from this list and prime-order checks the order line
   against it: one list, never a battery a request body names. */
function tenantCatalog(orgId, og, sf) {
  og = og || {}; sf = sf || {};
  if (typeof BP.fromRecords === 'function') return BP.fromRecords(orgId, og, sf);
  var wl = og.whiteLabel || {}, brand = String(og.bessBrand || '') || String(wl.shortName || '') || String(og.name || '') || orgId;
  var slug = String(og.slug || orgId.split('.')[0] || 'org');
  function norm(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  var out = { orgId: orgId, brand: brand, entries: {}, keys: [], count: 0, ownOnly: BP.ownOnlyOf(og), owner: [norm(brand), norm(slug), norm(wl.shortName), norm(og.name)].filter(Boolean) };
  (Array.isArray(sf.products) ? sf.products : []).forEach(function (p) {
    var made = BP.toCatalogEntry(slug, p); if (!made) return;
    if (!made.entry.mfr) made.entry.mfr = brand;
    out.entries[made.key] = made.entry; out.keys.push(made.key); out.count++;
  });
  return out;
}
function unitsFor(orgId, og, sf) { return PP.units(tenantCatalog(orgId, og, sf), CC.entries(), { isOwn: BP.isOwn }) || []; }

/* ── the unit, the site, the plan, as quoted ──────────────────────────── */
function unitOf(u) {
  u = u || {};
  function n(v) { var x = num(v); return x == null ? null : x; }
  return { key: str(u.key, 120), sku: str(u.sku, 100), mfr: str(u.mfr, 80), model: str(u.model, 200), name: str(u.name || u.model, 200), short: str(u.short, 60),
    kw: n(u.kw), kwh: n(u.kwh), kwhApprox: u.kwhApprox === true, usable: n(u.usable), hours: n(u.hours),
    lFt: n(u.lFt), wFt: n(u.wFt), hFt: n(u.hFt), footprint: ['catalog', 'reference', 'rep', 'none'].indexOf(u.footprint) >= 0 ? u.footprint : (n(u.lFt) && n(u.wFt) ? 'catalog' : 'none'),
    chem: str(u.chem, 80), inv: str(u.inv, 200), incPcs: u.incPcs === true, incXfmr: u.incXfmr === true, incDisco: u.incDisco === true,
    xfmr: str(u.xfmr, 200), disco: str(u.disco, 200), caveat: str(u.caveat, 600), source: str(u.source, 30), vendorOrgId: str(u.vendorOrgId, 253) || null };
}
function pt(p) { return p && isFinite(+p.lat) && isFinite(+p.lng) ? { lat: +(+p.lat).toFixed(7), lng: +(+p.lng).toFixed(7) } : null; }
function box(b) { return b && isObj(b) ? { c: pt(b.c), lFt: num(b.lFt), wFt: num(b.wFt), rotDeg: num(b.rotDeg) || 0 } : null; }
/* the C2 geometry, rebuilt key by key (never the stored object) */
function geometry(l) {
  l = isObj(l) ? l : {};
  var a = isObj(l.area) ? l.area : null, cd = isObj(l.conduit) ? l.conduit : null, unit = box(l.unit);
  if (unit && l.unit) unit.footprint = ['catalog', 'reference', 'rep', 'none'].indexOf(l.unit.footprint) >= 0 ? l.unit.footprint : null;
  return { v: num(l.v) || 1,
    area: a ? { s: num(a.s), w: num(a.w), n: num(a.n), e: num(a.e), wFt: num(a.wFt), hFt: num(a.hFt), sqft: num(a.sqft) } : null,
    unit: unit, xfmr: box(l.xfmr), disco: box(l.disco), poi: pt(l.poi),
    conduit: cd && Array.isArray(cd.pts) ? { pts: cd.pts.slice(0, 50).map(pt).filter(Boolean), ft: num(cd.ft), type: str(cd.type, 20) } : null,
    conduitFt: num(l.conduitFt) };
}
function layoutHash(l) {
  if (l && typeof l.hash === 'string' && l.hash) return l.hash;
  return 'sha:' + crypto.createHash('sha256').update(JSON.stringify(geometry(l))).digest('hex').slice(0, 16);
}

/* ── the record ───────────────────────────────────────────────────────── */
/* in: { id, orgId, projectId, quoteNo, rev, status, createdAt, createdBy,
         customer (raw), pricing (raw), terms (raw), unit, layout, site,
         cost (costOf), seller (the snapshot the door built) } */
function compose(r, now) {
  var c = customer(r.customer), p = pricing(r.pricing), t = terms(r.terms), unit = unitOf(r.unit), cost = r.cost;
  var sell = sellOf(cost, p), geo = geometry(r.layout), site = r.site || {};
  var out = {
    id: r.id, orgId: r.orgId, projectId: r.projectId, quoteNo: r.quoteNo, rev: r.rev || 1, status: r.status || 'draft',
    customer: c,
    site: { address: str(site.address, 400), lat: num(site.lat), lng: num(site.lng), zip: str(site.zip, 10), utility: str(site.utility, 160), circuit: str(site.circuit, 160) },
    unit: unit, layout: geo, layoutHash: r.layoutHash || layoutHash(r.layout), cost: cost, pricing: sell, terms: t, seller: r.seller || null,
    composedAt: now
  };
  out.scope = scope(out);
  return out;
}
function unitLine(u) {
  var name = u.name || ((u.mfr ? u.mfr + ' ' : '') + u.model);
  var size = [u.kw ? n0(u.kw) + ' kW' : '', u.kwh ? (u.kwhApprox ? '~' : '') + n0(u.kwh) + ' kWh' : ''].filter(Boolean).join(' / ');
  return name + (size ? ' — ' + size : '') + ' battery energy storage system';
}
function scope(r) {
  var u = r.unit, show = r.pricing.showGroupPrices, g = {}, ft = r.layout.conduitFt || (r.layout.conduit && r.layout.conduit.ft);
  r.pricing.groups.forEach(function (x) { g[x.key] = x.sellCents; });
  /* a line is priced only when it carries money: a group with nothing
     behind it (or none at all) sends null, never "$0" */
  function amount(c) { return show && typeof c === 'number' && c > 0 ? money(c) : null; }
  var gear = [!u.incXfmr ? 'transformer' : '', !u.incDisco ? 'disconnect' : ''].filter(Boolean);
  return [
    { key: 'battery', name: unitLine(u) + (gear.length ? ', with its ' + gear.join(' and ') : ''), amount: 'Quoted by ' + (u.mfr || 'the manufacturer') },
    { key: 'installation', name: 'Installation: site and civil works, the equipment pad, electrical installation' + (ft ? ', ' + n0(ft) + ' ft of service conduit' : '') + ', commissioning and energisation', amount: amount(g.installation) },
    { key: 'engineering', name: 'Engineering, permitting and the utility interconnection application', amount: amount(g.engineering) }
  ];
}

/* ── identity, keys and the status machine ── */
function newId() { return 'qt-' + crypto.randomBytes(8).toString('hex'); }
function validId(id) { return typeof id === 'string' && /^qt-[a-f0-9]{16}$/.test(id); }
function token() { return crypto.randomBytes(24).toString('hex'); }
function hashKey(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }
function verifyKey(record, key) {
  if (typeof key !== 'string' || !/^[a-f0-9]{48}$/.test(key) || !record || !record.acceptance || !record.acceptance.keyHash) return false;
  var a = Buffer.from(hashKey(key)), b = Buffer.from(String(record.acceptance.keyHash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
/* ── a quote's validity is a DATE ─────────────────────────────────────────
   The customer is told "valid until <date>" — the email, the deck,
   quote.html, the Desk and Today all print the date — so the offer holds
   to the END of that date: the door stores acceptance.validUntil as
   23:59:59.999 UTC on the UTC date that sentAt + validDays falls on, and
   expired() is simply "now is past that moment". UTC end of day, decided
   2026-10-17, because every surface prints the date in UTC (the views send
   'YYYY-MM-DD', the deck formats with timeZone 'UTC', quote.html and Today
   read 'YYYY-MM-DD' as lasting to 23:59:59.999Z): one meaning, everywhere. */
function endOfUtcDay(ms) { var d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999); }
function validUntilAt(sentAt, days) { return endOfUtcDay(sentAt + days * DAY_MS); }
function expired(record, now) { return (record.status === 'sent' || record.status === 'viewed') && !!(record.acceptance && record.acceptance.validUntil) && now > record.acceptance.validUntil; }
function changeable(status) { return CHANGEABLE.indexOf(status) >= 0; }
/* the customer's questions, kept on the record across edits and sends (a
   record from before 2026-10-17 kept them on its acceptance block) */
function questionsOf(r) {
  var list = r && Array.isArray(r.questions) ? r.questions : (r && r.acceptance && Array.isArray(r.acceptance.questions) ? r.acceptance.questions : []);
  return list.filter(function (q) { return q && typeof q.message === 'string'; });
}
function transition(record, to, now) {
  var from = record.status;
  if (STATUSES.indexOf(to) < 0) fail('Unknown status');
  if (!MOVES[from] || MOVES[from].indexOf(to) < 0) fail('A ' + from + ' quote cannot become ' + to, 409);
  if (to === 'approved' && expired(record, now)) fail('This quote expired on ' + new Date(record.acceptance.validUntil).toISOString().slice(0, 10) + '; ask for a new one', 409);
}
function quoteNo(org, orgId, id, now) {
  org = org || {};
  var slug = String(org.slug || String(orgId || '').split('.')[0] || 'Q').replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() || 'Q';
  return slug + '-Q-' + new Date(now).toISOString().slice(0, 10).replace(/-/g, '') + '-' + String(id).slice(-5).toUpperCase();
}
function ipHash(ip, orgId) { return crypto.createHash('sha256').update(String(ip || '') + ':' + String(orgId || '')).digest('hex').slice(0, 32); }

/* ── the views ────────────────────────────────────────────────────────── */
/* the DATE the quote is valid through (UTC; see validUntilAt): a sent
   quote's stored end of day; a draft's counted from when it was saved
   (the send sets the real one, from the moment it goes) */
function validUntilOf(r) {
  var acc = r.acceptance || {}, at = iso(acc.validUntil);
  if (at) return at.slice(0, 10);
  var from = acc.sentAt || r.updatedAt || r.composedAt;
  return typeof from === 'number' && isFinite(from) ? iso(validUntilAt(from, r.terms.validDays)).slice(0, 10) : null;
}
function sellerView(s) {
  s = s || {};
  var co = s.company || null, a = (co && co.address) || {};
  return { name: str(s.name, 120), logoUrl: str(s.logoUrl, 260000), accent: hex(s.accent), tagline: str(s.tagline, 160),
    company: co ? { legalName: str(co.legalName, 120), address: { line1: str(a.line1, 120), line2: str(a.line2, 120), city: str(a.city, 120), state: str(a.state, 120), postalCode: str(a.postalCode, 120) },
      phone: str(co.phone, 40), email: str(co.email, 254), website: str(co.website, 300) } : null,
    rep: { name: str(s.rep && s.rep.name, 120), email: str(s.rep && s.rep.email, 254) }, attribution: str(s.attribution, 160) };
}
/* everything the customer approves: what the snapshot hash covers */
function content(r) {
  var u = r.unit || {}, acc = r.acceptance || {}, c = r.customer || {}, a = c.address || {}, site = r.site || {}, geo = r.layout || {};
  var mfr = u.mfr || 'the manufacturer';
  return {
    quoteNo: r.quoteNo, rev: r.rev,
    issuedAt: iso(acc.sentAt || r.updatedAt || r.composedAt), validUntil: validUntilOf(r),
    seller: sellerView(r.seller),
    customer: { name: str(c.name, 120), company: str(c.company, 160), email: str(c.email, 254), phone: str(c.phone, 40),
      address: { line1: str(a.line1, 200), city: str(a.city, 100), state: str(a.state, 40), zip: str(a.zip, 20) } },
    site: { address: str(site.address, 400), utility: str(site.utility, 160), circuit: str(site.circuit, 160) },
    system: { unit: { mfr: str(u.mfr, 80), model: str(u.model, 200), short: str(u.short, 60), kw: num(u.kw), kwh: num(u.kwh), kwhApprox: u.kwhApprox === true, usable: num(u.usable), hours: num(u.hours),
        chem: str(u.chem, 80), footprint: str(u.footprint, 10), caveat: str(u.caveat, 600) },
      layout: geometry(geo), conduitFt: num(geo.conduitFt) || (geo.conduit ? num(geo.conduit.ft) : null), areaSqft: geo.area ? num(geo.area.sqft) : null },
    scope: (r.scope || []).map(function (x) { return { name: str(x.name, 400), amount: x.amount == null ? null : str(x.amount, 60) }; }),
    price: { total: money(r.pricing && r.pricing.sellCents),
      note: 'Installed price for the scope above. The ' + mfr + ' battery is quoted by ' + mfr + ' and confirmed when the order is placed.' },
    terms: { validDays: r.terms.validDays, paymentTerms: str(r.terms.paymentTerms, 400), notes: para(r.terms.notes, 2000),
      exclusions: (r.terms.exclusions || []).map(function (x) { return str(x, 200); }) }
  };
}
function snapshotOf(r) { return crypto.createHash('sha256').update(JSON.stringify(content(r))).digest('hex'); }
function customerView(r) {
  var c = content(r), acc = r.acceptance || {}, by = acc.approvedBy || {};
  return { id: r.id, quoteNo: c.quoteNo, rev: c.rev, status: r.status, issuedAt: c.issuedAt, validUntil: c.validUntil, snapshot: r.snapshot || null,
    seller: c.seller, customer: c.customer, site: c.site, system: c.system, scope: c.scope, price: c.price, terms: c.terms,
    decision: { approvedAt: iso(acc.approvedAt), approvedBy: acc.approvedAt ? { name: str(by.name, 120), title: str(by.title, 120) } : null,
      declinedAt: iso(acc.declinedAt), declineReason: acc.declinedAt ? str(acc.declineReason, 1000) : '' } };
}
/* Where the seller opens an approved quote's order: its OWN Omega Logic, on
   that order (omega-logic.html reads ?org= and ?order=, #orders the pane).
   Only for an order in the quote's own workspace: a link into another
   workspace's office would only be refused there. */
function logicUrl(org, id) { return org && id ? '/omega-logic?org=' + encodeURIComponent(org) + '&order=' + encodeURIComponent(id) + '#orders' : null; }
function handoffUrl(r) { var h = (r && r.handoff) || {}; return h.orderId && !h.error && h.org && h.org === r.orgId ? logicUrl(h.org, h.orderId) : null; }
/* the seller's own view: the customer's, plus what is behind it */
function tenantView(r, extra) {
  extra = extra || {};
  var v = customerView(r), cost = r.cost || {}, p = r.pricing || {}, acc = r.acceptance || {}, h = r.handoff || null;
  v.projectId = r.projectId;
  v.internal = { cost: { total: money(cost.totalCents && cost.totalCents.base), lo: money(cost.totalCents && cost.totalCents.lo), hi: money(cost.totalCents && cost.totalCents.hi),
      divisions: (cost.divisions || []).map(function (d) { return { name: d.name, amount: money(d.baseCents) }; }), estimateClassPlain: cost.estimateClassPlain || '',
      pricedBy: cost.pricedBy || '', at: cost.at || '', supplierNote: cost.supplierNote || '' },
    mode: p.mode || 'markup', markupPct: p.mode === 'markup' ? p.markupPct : p.effectiveMarkupPct, totalUsd: p.totalUsd == null ? null : p.totalUsd, showGroupPrices: !!p.showGroupPrices,
    sell: money(p.sellCents), margin: money(p.marginCents), marginPct: p.marginPct,
    groups: (p.groups || []).map(function (g) { return { key: g.key, amount: money(g.sellCents) }; }) };
  /* every question the customer asked (the last QUESTIONS_KEPT, oldest
     first), whichever send it came in on; acceptance.questions is the ones
     asked on the CURRENT link, which is what the per-send cap counts */
  var qs = questionsOf(r).map(function (q) { return { at: iso(q.at), message: para(q.message, 2000), email: str(q.email, 254), rev: num(q.rev), sentAt: iso(q.sentAt) }; });
  v.questions = qs;
  v.acceptance = { sentAt: iso(acc.sentAt), sentTo: acc.sentTo || '', viewedAt: iso(acc.viewedAt), lastViewedAt: iso(acc.lastViewedAt), viewCount: acc.viewCount || 0,
    deliver: acc.deliver || null, questions: acc.sentAt ? qs.filter(function (q) { return q.sentAt === iso(acc.sentAt); }) : [] };
  v.mailState = r.mailState || null;
  /* a change after an approval is a NEW quote on the same site: the page
     warns before it is sent, because its approval cannot be ordered while
     the earlier order is live (prime-order.js refuses a second one) */
  var sup = extra.supersedes;
  v.supersedes = sup && sup.quoteId ? { quoteId: str(sup.quoteId, 40), quoteNo: str(sup.quoteNo, 60), orderNo: sup.orderNo ? str(sup.orderNo, 40) : null, live: sup.live === true } : null;
  v.handoff = h ? { orderId: h.orderId || null, orderNo: h.orderNo || null, org: h.org || null, workspace: h.workspace || null, manufacturer: h.manufacturer || null,
    reference: h.reference === true, procure: h.procure ? { mfr: str(h.procure.mfr, 80), mfrOrgId: h.procure.mfrOrgId || null } : null,
    logicUrl: handoffUrl(r), at: iso(h.at), error: h.error || null, tries: h.tries || 0 } : null;
  v.events = (extra.events || []).slice(0, 20).map(function (e) { return { at: iso(e.at) || e.at || null, what: str(e.what, 300) }; });
  /* only a quote that can still be saved can be stale: an approved one is final */
  v.stale = extra.stale === true && changeable(r.status);
  v.updatedAt = iso(r.updatedAt);
  return v;
}
function summaryRow(r, extra) {
  extra = extra || {};
  var acc = r.acceptance || {}, c = r.customer || {};
  return { id: r.id, quoteNo: r.quoteNo, rev: r.rev, status: r.status, customer: { name: c.name || '', company: c.company || '' },
    site: (r.site && r.site.address) || '', sellTotal: money(r.pricing && r.pricing.sellCents),
    sentAt: iso(acc.sentAt), viewedAt: iso(acc.viewedAt), lastViewedAt: iso(acc.lastViewedAt), viewCount: acc.viewCount || 0,
    decidedAt: iso(acc.approvedAt || acc.declinedAt), validUntil: acc.validUntil ? iso(acc.validUntil).slice(0, 10) : null,
    projectId: r.projectId, stale: extra.stale === true && changeable(r.status), stage: extra.stage || null, updatedAt: iso(r.updatedAt),
    handoff: r.handoff ? { orderNo: r.handoff.orderNo || null, error: r.handoff.error || null, logicUrl: handoffUrl(r) } : null };
}
/* the status-only mirror on projects/{id}.prime.quote: no price, no person
   (a JDA collaborator reads the project) */
function mirror(r) {
  var acc = r.acceptance || {};
  return { id: r.id, quoteNo: r.quoteNo, status: r.status, rev: r.rev, sentAt: iso(acc.sentAt), decidedAt: iso(acc.approvedAt || acc.declinedAt) };
}

module.exports = { VALID_DAYS: VALID_DAYS, MAX_VALID_DAYS: MAX_VALID_DAYS, QUESTION_CAP: QUESTION_CAP, QUESTIONS_KEPT: QUESTIONS_KEPT, PER_QUOTE_DAY: PER_QUOTE_DAY, PER_ORG_DAY: PER_ORG_DAY,
  STATUSES: STATUSES, MOVES: MOVES, CHANGEABLE: CHANGEABLE, DEFAULT_EXCLUSIONS: DEFAULT_EXCLUSIONS, GROUPS: GROUPS,
  customer: customer, pricing: pricing, terms: terms, costOf: costOf, sellOf: sellOf, unitOf: unitOf, geometry: geometry, layoutHash: layoutHash,
  compose: compose, scope: scope, newId: newId, validId: validId, token: token, hashKey: hashKey, verifyKey: verifyKey, expired: expired, transition: transition,
  endOfUtcDay: endOfUtcDay, validUntilAt: validUntilAt, validUntilOf: validUntilOf, changeable: changeable, questionsOf: questionsOf,
  quoteNo: quoteNo, ipHash: ipHash, money: money, content: content, snapshotOf: snapshotOf, customerView: customerView, tenantView: tenantView,
  summaryRow: summaryRow, mirror: mirror, email: email, str: str, para: para,
  tenantCatalog: tenantCatalog, unitsFor: unitsFor, logicUrl: logicUrl, handoffUrl: handoffUrl };
