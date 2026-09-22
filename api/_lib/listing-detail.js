/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   What a Crexi LISTING PAGE says, read off its visible text.

   The imported snapshot came from search cards: address, price, type, size.
   A listing page carries the rest — days on market, NOI, cap rate, tenancy,
   lease expiry, year built, the brokers and their firm. A staff member
   captures the page text with the bookmarklet in the site finder (one click
   per listing) and imports the file; this turns that text into fields.

   Read from the page seen on 22 Sep 2026 (5730 W Dempster St, Morton Grove):
     "Unpriced | 1 day on market | Updated 1 day ago"
     a Details grid of label/value pairs (Property Type · Retail, Square
     Footage · 14,440, Acreage · 0.720, NOI · $375,435, Occupancy · 100%,
     Lease Expiration · 07/31/2028, Year Built · 2001 …)
     broker cards: name, "IL IL: #475.189621", "View phone number", firm
     "Listed by JLL - New York City, New York."
   Owner and sale history sit on the Record tab behind Crexi Intelligence
   and are NOT on this page; a field the text does not carry is absent, and
   the card keeps saying "pending API integration" for it. The raw text is
   kept (trimmed) so a better parser can re-read old captures.

   Pure. innerText from a grid arrives as "label<TAB>value" or as the label
   on one line and the value on the next; both are read. */
'use strict';

var LABELS = {
  propertyType: /^property type$/i, subtype: /^sub ?type$/i, sqft: /^(square footage|building size|building sf|total sf|sf)$/i,
  lotAcres: /^(acreage|lot size|lot acres|land area)$/i, groundLease: /^ground lease$/i, noi: /^noi$/i, capRate: /^cap rate$/i,
  pricePerSf: /^(price\s*\/\s*sf|price per sf|price\/sqft)$/i, tenancy: /^tenancy$/i, leaseType: /^lease type$/i,
  occupancy: /^occupancy$/i, investmentType: /^investment type$/i, leaseExpiration: /^lease expiration$/i,
  remainingTerm: /^remaining (lease )?term$/i, leaseOptions: /^lease options$/i, yearBuilt: /^year built$/i,
  zoning: /^zoning$/i, units: /^(units|number of units)$/i, parking: /^parking( spaces)?$/i, buildingClass: /^(building )?class$/i,
  stories: /^(stories|floors)$/i, yearRenovated: /^year renovated$/i, tenant: /^tenant( name)?$/i, ownerName: /^owner( name)?$/i,
  lastSaleDate: /^(last )?sale date$/i, lastSalePrice: /^(last )?sale price$/i, apn: /^(apn|parcel (id|number)|pin)$/i
};
var NUMERIC = { sqft: 1, lotAcres: 1, noi: 1, capRate: 1, pricePerSf: 1, occupancy: 1, yearBuilt: 1, units: 1, parking: 1, stories: 1, yearRenovated: 1, lastSalePrice: 1, remainingTerm: 1 };
var MAX_TEXT = 3000;

function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function money(s) { var m = String(s).match(/\$\s?([\d,]+(?:\.\d+)?)/); return m ? Number(m[1].replace(/,/g, '')) : null; }
function number(s) { var m = String(s).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; }
function isLabel(line) { var k; for (k in LABELS) if (LABELS[k].test(line)) return k; return null; }

/* The visible text as lines, with "label<TAB>value" split into two. */
function lines(text) {
  return String(text || '').split(/\r?\n/).reduce(function (out, raw) {
    var parts = raw.split(/\t+|\s{3,}/);
    parts.forEach(function (p) { p = clean(p); if (p) out.push(p); });
    return out;
  }, []);
}

function parse(text, capturedAt) {
  var L = lines(text), out = {}, i, k;
  var looksLikeValue = function (s) { return s && s.length <= 120 && !isLabel(s); };
  for (i = 0; i < L.length; i++) {
    var line = L[i], m = line.match(/^([^:]{2,40}):\s*(.+)$/), label = null, value = null;
    if (m && isLabel(m[1])) { label = isLabel(m[1]); value = m[2]; }
    else if ((k = isLabel(line)) && looksLikeValue(L[i + 1])) { label = k; value = L[i + 1]; i++; }
    if (!label || out[label] != null) continue;
    if (NUMERIC[label]) {
      var n = label === 'noi' || label === 'pricePerSf' || label === 'lastSalePrice' ? money(value) : number(value);
      if (n != null) out[label] = n;
    } else out[label] = clean(value).slice(0, 120);
  }
  var whole = L.join('\n');
  /* "Unpriced | 1 day on market | Updated 1 day ago", or "$2,450,000 | 12 days on market" */
  var dom = whole.match(/(\d+)\s+days?\s+on\s+market/i);
  if (dom) out.daysOnMarket = Number(dom[1]);
  else if (/\bon market\b/i.test(whole) && /\btoday\b/i.test(whole)) out.daysOnMarket = 0;
  var price = null;
  for (i = 0; i < L.length; i++) {
    if (/^unpriced\b/i.test(L[i])) { out.unpriced = true; break; }
    if (/^\$[\d,]{4,}(?:\.\d+)?$/.test(L[i]) || /^\$[\d,]{4,}\s*\|/.test(L[i])) { price = money(L[i]); break; }
  }
  if (price != null) out.askPrice = price;
  var upd = whole.match(/updated\s+(\d+|a|an)\s+(day|hour|minute|week|month)s?\s+ago/i);
  if (upd) out.updated = clean(upd[0]);
  /* "Listed by JLL - New York City, New York." — the firm first, its office after the dash. */
  var by = whole.match(/^listed by\s+(.+?)(?:\s+-\s+.*)?\.?$/im);
  if (by) out.listedBy = clean(by[1]).replace(/\.$/, '').slice(0, 120);
  /* Broker cards: a name on the line before a state licence ("IL IL: #475.189621", "IL 475.189943"). */
  var brokers = [], seen = {};
  for (i = 1; i < L.length && brokers.length < 4; i++) {
    if (/^[A-Z]{2}\s+(?:[A-Z]{2}:?\s*)?#?\s*[\d.]{5,}$/.test(L[i]) || /^(?:license|lic\.?)\s*#?\s*[\d.]{5,}$/i.test(L[i])) {
      var name = L[i - 1].replace(/\b(PRO|VERIFIED)\b/g, '').replace(/[^\w\s.'-]/g, '').trim();
      if (!name || seen[name] || name.split(' ').length > 5) continue;
      seen[name] = 1;
      var b = { name: name.slice(0, 80), licence: L[i].slice(0, 40) }, j;
      for (j = i + 1; j < Math.min(L.length, i + 6); j++) {
        var ph = L[j].match(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/), em = L[j].match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
        if (ph && !b.phone) b.phone = ph[0];
        if (em && !b.email) b.email = em[0];
        if (/^[A-Z][\w&.' -]{1,40}$/.test(L[j]) && !/^(view|pro|verified|il|request)/i.test(L[j]) && !/\d/.test(L[j]) && !b.firm && L[j] !== name) b.firm = L[j];
      }
      if (!b.firm && out.listedBy) b.firm = out.listedBy;
      brokers.push(b);
    }
  }
  if (brokers.length) out.brokers = brokers;
  var phone = whole.match(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/), email = whole.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (phone && !(brokers[0] && brokers[0].phone)) out.phone = phone[0];
  if (email && !(brokers[0] && brokers[0].email)) out.email = email[0];
  /* The listing's headline: the line right after the price line, if any. */
  for (i = 0; i < L.length - 1; i++) if (/^(unpriced|\$[\d,]+)/i.test(L[i])) { if (looksLikeValue(L[i + 1]) && !/on market|updated/i.test(L[i + 1])) out.headline = L[i + 1].slice(0, 120); break; }
  if (out.propertyType && /^\$/.test(out.propertyType)) delete out.propertyType;
  out.capturedAt = capturedAt || null;
  out.src = 'crexi-page';
  return out;
}

/* Fields the catalogue keeps, typed. Anything else the parser guessed is dropped here. */
var KEEP = { propertyType: 's', subtype: 's', sqft: 'n', lotAcres: 'n', groundLease: 's', noi: 'n', capRate: 'n', pricePerSf: 'n', tenancy: 's', leaseType: 's',
  occupancy: 'n', investmentType: 's', leaseExpiration: 's', remainingTerm: 'n', leaseOptions: 's', yearBuilt: 'n', zoning: 's', units: 'n', parking: 'n',
  buildingClass: 's', stories: 'n', yearRenovated: 'n', tenant: 's', ownerName: 's', lastSaleDate: 's', lastSalePrice: 'n', apn: 's', daysOnMarket: 'n',
  unpriced: 'b', askPrice: 'n', updated: 's', listedBy: 's', phone: 's', email: 's', headline: 's', capturedAt: 's', src: 's' };
function sanitize(d) {
  var out = {}, k;
  for (k in KEEP) {
    if (!d || d[k] == null) continue;
    if (KEEP[k] === 'n' && typeof d[k] === 'number' && isFinite(d[k])) out[k] = d[k];
    else if (KEEP[k] === 's' && typeof d[k] === 'string') out[k] = d[k].slice(0, 160);
    else if (KEEP[k] === 'b') out[k] = !!d[k];
  }
  if (d && Array.isArray(d.brokers)) out.brokers = d.brokers.slice(0, 4).map(function (b) {
    var o = {}; ['name', 'firm', 'phone', 'email', 'licence'].forEach(function (f) { if (typeof b[f] === 'string' && b[f]) o[f] = b[f].slice(0, 120); }); return o;
  }).filter(function (b) { return b.name; });
  return out;
}

function trimText(text) { return String(text || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, MAX_TEXT); }

module.exports = { parse: parse, sanitize: sanitize, trimText: trimText, lines: lines, MAX_TEXT: MAX_TEXT };
