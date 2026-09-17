/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · site spine — the PURE half of bulk site import + sharing
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   No Firestore, no network, no request object. Everything here is a function
   of its arguments so scripts/tests/tsitespine.js can run it in node with no
   credential. sites-import.js and sites-projection.js are the thin I/O layer
   around this file.

   THREE DECISIONS

   1 · THE SITE ID IS DETERMINISTIC.  `${orgId}:${sourceKey}`. Upload the same
       spreadsheet twice and the second run UPDATES; it never doubles the
       portfolio. sourceKey is the provider's own row id when there is one,
       otherwise a hash of the normalised street address + zip. An auto-id
       here would make every re-upload a duplicate and the site count a lie.

   2 · NOTHING IS INVENTED.  A column that is blank stays absent from the
       document. The page renders an absent field as [CONFIRM]. A default
       typed here would be indistinguishable from a fact six months on.

   3 · THE PROJECTION IS THE ONLY THING A NON-OWNER SEES.  Owner mailing,
       lease economics, revenue-share and anything under `confidential` never
       leave the owner tenant. The strip list lives HERE, once, so the API
       and the tests agree on what "partner-safe" means.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';

var VERTICALS = ['ev', 'bess', 'solar', 'dc', 'microgrid', 'other'];
var SOURCES   = ['manual', 'csv', 'xlsx', 'listings', 'feed'];

/* Same fallback the sites dashboard's normalize() uses for an unknown stage —
   see the comment above hasStatus() in firestore.rules. */
var DEFAULT_STATUS = 'identified';

/* ── Address key ────────────────────────────────────────────────────────────
   Lower-cased, punctuation dropped, the usual suffix/direction abbreviations
   folded, whitespace collapsed. "600 N. Union Avenue" and "600 north union ave"
   dedupe to the same row. Deliberately NOT a geocode: two rows with the same
   coordinates but different units are different sites. */
var ABBR = {
  street: 'st', avenue: 'ave', boulevard: 'blvd', road: 'rd', drive: 'dr',
  lane: 'ln', court: 'ct', place: 'pl', parkway: 'pkwy', highway: 'hwy',
  circle: 'cir', terrace: 'ter', trail: 'trl', way: 'way', square: 'sq',
  north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
  suite: 'ste', apartment: 'apt', building: 'bldg', floor: 'fl'
};
function addressKey(addr, zip) {
  var a = String(addr == null ? '' : addr).toLowerCase()
    .replace(/[.,#'"()]/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .map(function (w) { return ABBR[w] || w; })
    .join(' ');
  var z = String(zip == null ? '' : zip).replace(/[^0-9]/g, '').slice(0, 5);
  return a && z ? a + '|' + z : a;
}

/* FNV-1a, 32-bit, hex. Not cryptographic and does not need to be: the goal is
   a short stable key for a document id, and collisions inside ONE tenant's
   address book are vanishingly unlikely at this size. */
function fnv1a(s) {
  var h = 0x811c9dc5, i;
  for (i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/* Firestore document ids may not contain '/', and we keep them short and
   printable so they survive a URL. */
function safeKey(s) {
  return String(s).trim().replace(/[\/\s]+/g, '_').replace(/[^A-Za-z0-9_.:@+~-]/g, '').slice(0, 120);
}

/* sourceKey: provider row id if given, else address hash. Returns '' when the
   row cannot be keyed at all — the caller refuses that row rather than
   inventing an id for it. */
function sourceKeyOf(row) {
  if (row.sourceKey) return safeKey(row.sourceKey);
  if (row.id)        return safeKey(row.id);
  var k = addressKey(row.addr, row.zip);
  return k ? 'a' + fnv1a(k) : '';
}
function siteIdOf(orgId, sourceKey) {
  return String(orgId).toLowerCase() + ':' + sourceKey;
}

/* ── Field coercion ─────────────────────────────────────────────────────────
   Numbers come out of spreadsheets as "1,200", "480 kW", "" and 480. Only a
   parseable number is kept; anything else is ABSENT, not zero. */
function num(v) {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return isFinite(v) ? v : undefined;
  var n = Number(String(v).replace(/[,$\s]/g, '').replace(/[a-zA-Z%]+$/, ''));
  return isFinite(n) ? n : undefined;
}
function str(v) {
  if (v == null) return undefined;
  var s = String(v).trim();
  return s ? s : undefined;
}
function lower(v) { var s = str(v); return s ? s.toLowerCase() : undefined; }
function put(o, k, v) { if (v !== undefined) o[k] = v; }

/* ── One row → one site document ────────────────────────────────────────────
   `row` is already column-mapped by the page (keys named as below).
   `ctx` = { orgId, portfolioId, source, importId, uploadedBy, uploadedAt,
             rowNumber, vertical, origination: { partnerOrg } }
   Returns { ok, siteId, doc } or { ok:false, reason }. */
function siteFromRow(row, ctx) {
  var key = sourceKeyOf(row);
  if (!key) return { ok: false, reason: 'no address and no source id — the row cannot be keyed' };

  var vertical = lower(row.vertical) || ctx.vertical;
  if (vertical && VERTICALS.indexOf(vertical) < 0) {
    return { ok: false, reason: 'unknown vertical "' + vertical + '"' };
  }

  var d = {
    siteId:    siteIdOf(ctx.orgId, key),
    orgId:     ctx.orgId,
    source:    ctx.source,
    sourceKey: key,
    status:    str(row.status) || DEFAULT_STATUS
  };
  put(d, 'portfolioId', ctx.portfolioId);
  put(d, 'siteName',    str(row.siteName || row.name));
  put(d, 'addr',        str(row.addr));
  put(d, 'city',        str(row.city));
  put(d, 'state',       str(row.state) && String(row.state).trim().toUpperCase().slice(0, 2));
  put(d, 'zip',         str(row.zip) && String(row.zip).replace(/[^0-9-]/g, '').slice(0, 10));
  put(d, 'lat',         num(row.lat));
  put(d, 'lon',         num(row.lon));
  put(d, 'vertical',    vertical);
  put(d, 'stage',       str(row.stage));
  put(d, 'type',        str(row.type));
  put(d, 'sqft',        num(row.sqft));
  put(d, 'lotAcres',    num(row.lotAcres));
  put(d, 'feederId',    str(row.feederId));
  put(d, 'notes',       str(row.notes));

  if (vertical === 'ev') {
    var ev = {};
    put(ev, 'chargers',    num(row.chargers));
    put(ev, 'dcfcKw',      num(row.dcfcKw));
    put(ev, 'l2Kw',        num(row.l2Kw));
    put(ev, 'totalKw',     num(row.totalKw));
    put(ev, 'utilTercile', str(row.utilTercile));
    /* totalKw is the one number we will derive, and only from its own parts:
       both halves present and no total typed. Never from a guess. */
    if (ev.totalKw === undefined && ev.dcfcKw !== undefined && ev.l2Kw !== undefined) {
      ev.totalKw = ev.dcfcKw + ev.l2Kw;
      ev.totalKwSrc = 'derived';
    }
    if (Object.keys(ev).length) d.ev = ev;
  }

  /* Owner-facing only. Anything a partner must never see goes UNDER
     `confidential` so the projection strips one key, not a growing list. */
  var c = {};
  if (row.ownerName || row.ownerMailing || row.ownerPhone || row.ownerEmail) {
    var owner = {};
    put(owner, 'name',    str(row.ownerName));
    put(owner, 'mailing', str(row.ownerMailing));
    put(owner, 'phone',   str(row.ownerPhone));
    put(owner, 'email',   lower(row.ownerEmail));
    c.owner = owner;
  }
  put(c, 'leaseUsdYr',   num(row.leaseUsdYr));
  put(c, 'leaseTermYrs', num(row.leaseTermYrs));
  put(c, 'revSharePct',  num(row.revSharePct));
  put(c, 'terms',        str(row.terms));
  if (Object.keys(c).length) d.confidential = c;

  d.provenance = {
    uploadedBy: ctx.uploadedBy, uploadedAt: ctx.uploadedAt,
    importId: ctx.importId, rowNumber: ctx.rowNumber
  };
  put(d.provenance, 'fileName', ctx.fileName);

  return { ok: true, siteId: d.siteId, doc: d };
}

/* ── Partner-safe projection ─────────────────────────────────────────────────
   What a site looks like to any org that is NOT its owner. Whitelist, not
   blacklist: a new owner-only field added to the record later is invisible
   here until someone adds it deliberately. */
var PROJECTION_FIELDS = ['siteId', 'orgId', 'portfolioId', 'siteName', 'addr', 'city', 'state', 'zip',
  'lat', 'lon', 'vertical', 'stage', 'status', 'type', 'sqft', 'lotAcres', 'feederId', 'ev',
  'source', 'createdAt', 'updatedAt'];
/* The PUBLIC projection is narrower still: no street address, no feeder, and
   coordinates rounded to ~1 km so a marketplace card places a pin on a town,
   not on a parcel somebody is still negotiating. */
var PUBLIC_FIELDS = ['siteId', 'portfolioId', 'siteName', 'city', 'state', 'vertical', 'stage', 'type', 'ev', 'lat', 'lon'];

function project(site, mode) {
  var fields = mode === 'public' ? PUBLIC_FIELDS : PROJECTION_FIELDS, out = {}, i, k;
  for (i = 0; i < fields.length; i++) {
    k = fields[i];
    if (site[k] !== undefined && site[k] !== null) out[k] = site[k];
  }
  if (mode === 'public') {
    if (typeof out.lat === 'number') out.lat = Math.round(out.lat * 100) / 100;
    if (typeof out.lon === 'number') out.lon = Math.round(out.lon * 100) / 100;
  }
  out.projection = mode === 'public' ? 'public' : 'partner';
  return out;
}

/* Reviewed inbox: a freshly imported site is not yet part of the portfolio's
   numbers, and it is not shareable, until a person accepts it. */
function reviewState(site) {
  var r = site && site.review;
  return (r && r.state) || 'accepted';
}
function isShareable(site) { return reviewState(site) === 'accepted'; }

/* EV roll-up: charger-level rows → one site line. Used by the portfolio page
   and by the import preview so both show the same totals. */
function rollupEv(sites) {
  var t = { sites: 0, chargers: 0, dcfcKw: 0, l2Kw: 0, totalKw: 0, missingKw: 0 }, i, e;
  for (i = 0; i < sites.length; i++) {
    t.sites++;
    e = sites[i].ev || {};
    if (typeof e.chargers === 'number') t.chargers += e.chargers;
    if (typeof e.dcfcKw   === 'number') t.dcfcKw   += e.dcfcKw;
    if (typeof e.l2Kw     === 'number') t.l2Kw     += e.l2Kw;
    if (typeof e.totalKw  === 'number') t.totalKw  += e.totalKw; else t.missingKw++;
  }
  return t;
}

module.exports = {
  VERTICALS: VERTICALS, SOURCES: SOURCES, DEFAULT_STATUS: DEFAULT_STATUS,
  PROJECTION_FIELDS: PROJECTION_FIELDS, PUBLIC_FIELDS: PUBLIC_FIELDS,
  addressKey: addressKey, fnv1a: fnv1a, sourceKeyOf: sourceKeyOf, siteIdOf: siteIdOf,
  siteFromRow: siteFromRow, project: project, reviewState: reviewState, isShareable: isShareable,
  rollupEv: rollupEv, num: num
};
