/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   POST /api/listings: search, detail or staff-only offline probe.
   No live Crexi schema or credentials have been supplied or verified.
   HTTPS destinations/routes/auth are server-controlled; no redirects.
   Tenant settings may choose an explicitly approved proxy and map raw fields.
   All calls check auth/org/billing/member access. Metered requests atomically
   claim per-org daily allowance; detail cache keys include org and connection.
   Empty results, unconfigured service and upstream failure are distinct.
   See docs/sitefinder-server-config.md for exact configuration and contracts. */
'use strict';
var A = require('./_lib/admin');
var crypto = require('crypto');
var SS = require('./_lib/site-score');

/* The in-memory per-minute limiter, borrowed rather than rewritten. It lives in
   _lib/embed.js because the public surface needed it first, and it is exported;
   a second bucket map here would be a second answer to "how fast is too fast".
   Requiring that module runs no code beyond function definitions. */
var E = require('./_lib/embed');

/* THE SHARED PIPELINE. omega-listings-source.js is an ES5 browser file whose
   IIFE takes `typeof window !== "undefined" ? window : this` — and in a
   CommonJS module top-level `this` IS module.exports, so a plain require works
   and hands back { OmegaListings }. scripts/tests/tlistingfeed.js already
   requires it the same way. Nothing in the module touches XMLHttpRequest at
   load time. */
var LSMOD = require('../omega-listings-source.js');
var LS = (LSMOD && LSMOD.OmegaListings) ||
         (typeof global !== 'undefined' ? global.OmegaListings : null) || null;

/* ── constants ──────────────────────────────────────────────────────────── */

var PROVIDER = 'crexi';
var TOOL_KEY = 'sitefinder';          /* omega-tools.js catalog key */

/* Tiers that carry the metered source, spelled as api/tenant-billing.js TIERS
   spells them. Same arrangement parcel.js uses for Regrid: an override wins
   either way, then the add-on, then the tier. `listings` is a NEW add-on and a
   NEW override key — nobody has set either yet, which is why an org running on
   its OWN credential skips this gate entirely (see entitle()). */
var LISTINGS_TIERS = ['deluxe', 'enterprise', 'partner', 'internal'];
var LISTINGS_ADDON = 'listings';
var OVERRIDE_KEY = 'listings';

var CACHE = 'listing_cache';
var CACHE_TTL_MS = 24 * 3600 * 1000;
var COUNTER_DOC = 'listings';
var DAILY_DEFAULT = 60;

var TIMEOUT_MS = 12000;
var PER_MIN = { search: 12, detail: 40, probe: 30 };

/* commercial.js's guard, to the same numbers. Six degrees of longitude is most
   of a time zone: this is a ceiling against absurdity — a rep who zoomed all
   the way out and panned — not the cost control. The cost controls are the
   per-minute limit above and the daily allowance below. */
var MAX_BBOX_LON = 6, MAX_BBOX_LAT = 5;
var MAX_LIMIT = 300, DEFAULT_LIMIT = 200;
var MAX_SAMPLE_BYTES = 256 * 1024;

/* Our own proxy's route names — the contract omega-listings-source.js and
   docs/README-sitefinder.md already describe ({PROXY}/crexi/search and
   /crexi/detail?q=). They are defaults, not assertions about Crexi's API: a
   base URL pointing straight at the vendor needs its own paths and parameter
   names, and both are configuration. */
var DEFAULT_SEARCH_PATH = '/crexi/search';
var DEFAULT_DETAIL_PATH = '/crexi/detail';
var DEFAULT_PARAMS = {
  minLat: 'minLat', maxLat: 'maxLat', minLon: 'minLon', maxLon: 'maxLon',
  types: 'types', minSqft: 'minSqft', limit: 'limit', q: 'q',
  lat: 'lat', lon: 'lon', id: 'id'
};

var SETTINGS_COLL = 'toolData', SETTINGS_DOC = 'apiSettings';

/* ── small mechanism ────────────────────────────────────────────────────── */

function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return null;
}
function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim().slice(0, max || 200);
}
/* FNV-1a, the same hash omega-listings-source.js uses internally. Mechanism,
   not a table — it is here so a truncated cache key cannot collide with
   another address that happens to share its first hundred characters. */
function fnv(s) {
  var h = 2166136261, i;
  s = String(s);
  for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h.toString(36);
}

/* DELIBERATELY MINIMAL. Case, punctuation and runs of whitespace are folded;
   "Street" is NOT folded to "St". Two spellings of one address therefore cost
   two lookups, which is a known and accepted cost — the alternative is an
   abbreviation table that drifts, and a wrong cache HIT puts one building's
   owner on another building's card. Overspending is recoverable. */
function normAddr(v) {
  return clean(v, 300).toLowerCase()
    .replace(/[,.#]/g, ' ')
    .replace(/\s+(usa|united states)\s*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/* A Firestore document id cannot contain '/', so everything is folded to
   [a-z0-9-] and the full string's hash is appended. The readable prefix is for
   whoever has to look at this collection in the console. */
function cacheKey(kind, value) {
  var norm = kind === 'a' ? normAddr(value) : String(value).toLowerCase();
  var safe = norm.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
  return kind + '_' + (safe || 'x') + '_' + fnv(norm);
}

/* ── the field map, derived rather than copied ──────────────────────────── */

/* mapReport() against an EMPTY sample fills nothing, so every field lands in
   `empty` carrying the list of paths it tried — which, with no org override
   passed, is exactly CREXI_DEFAULT_MAP. That table is private to the module and
   this is how it is read without a second copy of it existing anywhere.

   Memoised for the life of the warm instance; a cold start re-derives it, so a
   change to the shared table ships with the next deploy of either file. */
var _defaultMap = null;
function defaultMap() {
  if (_defaultMap) return _defaultMap;
  var out = {}, rep, i;
  try { rep = LS.mapReport({}, null); } catch (e) { return {}; }
  for (i = 0; i < rep.empty.length; i++) {
    out[rep.empty[i].field] = (rep.empty[i].tried || []).slice();
  }
  _defaultMap = out;
  return out;
}

/* An org's override, sanitised. Every value must be a list of dotted paths;
   anything else is dropped rather than trusted, because this document is
   tenant-writable and a map is read by a resolver that walks object branches. */
function cleanMap(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  var known = defaultMap(), out = {}, n = 0, k, i, paths, p;
  for (k in m) {
    if (!Object.prototype.hasOwnProperty.call(m, k)) continue;
    /* Only fields the pipeline actually has. A provider may say where its data
       lives; it may not name a field the cards have never heard of. */
    if (!Object.prototype.hasOwnProperty.call(known, k)) continue;
    paths = Array.isArray(m[k]) ? m[k] : [m[k]];
    out[k] = [];
    for (i = 0; i < paths.length && i < 8; i++) {
      p = clean(paths[i], 120);
      if (p && /^[A-Za-z0-9_$][A-Za-z0-9_$.\-]*$/.test(p) &&
          !/(^|\.)(__proto__|prototype|constructor)(\.|$)/.test(p)) out[k].push(p);
    }
    if (out[k].length) n++; else delete out[k];
  }
  return n ? out : null;
}

/* Resolve one raw vendor record through the SHARED resolver. mapReport tries
   the configured paths before the defaults — the same precedence pick() uses —
   so this is the shared map, the shared dig() and the shared ordering, not a
   re-implementation of any of them. */
function resolved(raw, cfgMap) {
  var rep = LS.mapReport(raw, cfgMap), v = {}, i;
  for (i = 0; i < rep.filled.length; i++) v[rep.filled[i].field] = rep.filled[i].value;
  return { v: v, report: rep };
}

/* THE ONE SEAM, AND IT IS SELF-RETIRING.

   fromCrexi() in omega-listings-source.js assembles the normalized record and
   is PRIVATE to that module's closure — mapReport() is exported, fromCrexi() is
   not. So the grouping below (which resolved field goes into owner{} versus
   broker{} versus listed{}) is mirrored here, and mirrored code drifts.

   It checks for LS.fromCrexi first, so the day somebody adds
     S.fromCrexi = fromCrexi;
   to that module — two words, no behaviour change — this endpoint uses the
   original and everything under `else` becomes dead code to delete. That is the
   fix; this is the bridge until it lands. The response stamps which one ran. */
function usingSharedMapper() { return typeof LS.fromCrexi === 'function'; }

function toNormalized(raw, cfgMap) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (usingSharedMapper()) return LS.fromCrexi(raw, cfgMap);

  var r = resolved(raw, cfgMap), v = r.v;
  var deal = clean(v.dealType, 60);
  return {
    id: clean(v.id, 120),
    addr: clean(v.addr, 200),
    city: clean(v.city, 80),
    state: clean(v.state, 40),
    zip: clean(v.zip, 20),
    lat: num(v.lat), lon: num(v.lon),
    sqft: num(v.sqft), lotAcres: num(v.lotAcres),
    type: LS.normType(v.type),
    subtype: clean(v.subtype, 120),
    yearBuilt: num(v.yearBuilt),
    zoning: clean(v.zoning, 60),
    owner: { name: clean(v.ownerName, 160), mailing: '', phone: '', email: '' },
    /* The broker is the reachable human on a listed building and often the
       only one. Kept distinct from owner because they are not the same person
       and a rep must know which of them they are calling. */
    broker: { name: clean(v.brokerName, 120), firm: clean(v.brokerFirm, 160),
              phone: clean(v.brokerPhone, 40), email: clean(v.brokerEmail, 160) },
    listed: {
      forSale: raw.forSale === true || /sale/i.test(deal),
      forLease: raw.forLease === true || /lease/i.test(deal),
      askPrice: num(v.askPrice), askRate: num(v.askRate), capRate: num(v.capRate),
      daysOnMarket: num(v.daysOnMarket),
      url: clean(v.url, 500)
    },
    lastSale: { date: clean(v.lastSaleDate, 40), price: num(v.lastSalePrice) },
    assessedValue: null,
    photos: Array.isArray(v.photos) ? v.photos.slice(0, 20) : [],
    annualKwh: null,      /* modelLoad() may fill it, stamped */
    feederId: null,       /* joined spatially against hosting capacity */
    src: PROVIDER
  };
}

/* MODELLED, AND IT SAYS SO. The shared EUI table, converted kBtu to kWh, plus
   the load factor the same table publishes. Nothing here is metered and nothing
   here came from the listing; what came from the listing is sqft and type,
   which is what the table takes. Correct the table in omega-listings-source.js
   and every provider moves together — that is why it is one table. */
function modelLoad(rec) {
  if (!rec) return rec;
  var load = SS.modelLoad(rec);
  rec.annualKwh = load.annualKwh;
  rec.peakKw = load.peakKw;
  if (load.basis) rec.loadFactor = load.basis.loadFactor;
  return rec;
}

/* ── the connection ─────────────────────────────────────────────────────── */

/* https only, and no host that resolves inside a private network. The org's
   copy of this value is tenant-writable, so it is a request this server makes
   on a tenant's say-so and gets the same scrutiny any such request gets. */
function safeBase(v) {
  if (typeof v !== 'string' || /[\s\\]/.test(v)) return '';
  try {
    var u = new URL(v), host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || (u.port && u.port !== '443')) return '';
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /^[\d.]+$/.test(host) || /\.(local|internal|localhost)$/.test(host)) return '';
    return u.toString().replace(/\/+$/, '');
  } catch (e) { return ''; }
}

function safePath(v, fallback) {
  if (v == null || v === '') return fallback;
  if (typeof v !== 'string' || !/^\/[A-Za-z0-9_/-]*$/.test(v) || v.indexOf('//') >= 0)
    throw A.httpError(503, 'the listing route configuration is invalid');
  return v;
}

function orgSettings(orgId) {
  return Promise.resolve().then(function () {
    return A.db().collection(SETTINGS_COLL).doc(orgId)
      .collection('prefs').doc(SETTINGS_DOC).get();
  }).then(function (s) {
    var d = s && s.exists ? (s.data() || {}) : {};
    /* Written under `data` by the toolData convention; a flat document is
       accepted too, exactly as omega-settings.js reads it. */
    var vals = (d.data && typeof d.data === 'object') ? d.data : d;
    var cfg = vals && vals[PROVIDER];
    return (cfg && typeof cfg === 'object') ? cfg : {};
  }, function () { throw A.httpError(503, 'listing settings could not be read'); });
}

/* Resolve the endpoint, the credential and the field map into one object, and
   be explicit about where each part came from. Nothing here is ever returned
   to the browser except the provenance strings. */
function connection(cfg) {
  cfg = cfg || {};
  var envBase = safeBase(process.env.CREXI_BASE_URL);
  var orgBase = safeBase(cfg.baseUrl || cfg.proxy);
  var approved = String(process.env.CREXI_ALLOWED_BASE_URLS || '').split(',').map(function (v) { return safeBase(v.trim()); }).filter(Boolean);
  if (envBase) approved.push(envBase);
  if ((cfg.baseUrl || cfg.proxy) && (!orgBase || approved.indexOf(orgBase) < 0))
    throw A.httpError(503, 'the tenant listing endpoint is not approved by the server');
  var envKey = clean(process.env.CREXI_API_KEY, 400);
  /* Credentials belong in server environment variables, never tenant-readable prefs. */
  var orgKey = '';

  var base = orgBase || envBase;
  var baseFrom = orgBase ? 'org' : (envBase ? 'env' : null);
  var key = orgKey || envKey;
  var keyFrom = orgKey ? 'org' : (envKey ? 'env' : null);

  /* The rule in the header: our credential never travels to an endpoint a
     tenant chose. The call still goes out — a tenant pointing at our own
     worker, which holds the key itself, is the existing configuration. */
  var withheld = false;
  if (baseFrom === 'org' && keyFrom === 'env') { key = ''; keyFrom = null; withheld = true; }

  var missing = [];
  if (!envBase && !orgBase) missing.push('CREXI_BASE_URL');
  var keyless = process.env.CREXI_KEYLESS_PROXY === 'true';
  if (!key && !keyless) missing.push('CREXI_API_KEY');

  var map = cleanMap(cfg.map);
  return {
    connected: !!base && (!!key || keyless) && cfg.enabled !== false,
    disabled: cfg.enabled === false,
    base: base, baseFrom: baseFrom,
    key: key, keyFrom: keyFrom, keyWithheld: withheld,
    ownCredential: baseFrom === 'org' && keyFrom === 'org',
    missing: missing,
    searchPath: safePath(process.env.CREXI_SEARCH_PATH, DEFAULT_SEARCH_PATH),
    detailPath: safePath(process.env.CREXI_DETAIL_PATH, DEFAULT_DETAIL_PATH),
    authHeader: clean(process.env.CREXI_AUTH_HEADER, 60) || 'Authorization',
    authScheme: process.env.CREXI_AUTH_SCHEME === '' ? '' : (clean(process.env.CREXI_AUTH_SCHEME, 30) || 'Bearer'),
    params: paramNames(cfg.params),
    map: map,
    mapSource: map ? 'org-config' : 'defaults',
    searchBilled: process.env.CREXI_SEARCH_BILLED !== 'false'
  };
}

function paramNames(over) {
  var out = {}, k;
  for (k in DEFAULT_PARAMS) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_PARAMS, k)) continue;
    out[k] = (over && typeof over === 'object' && clean(over[k], 60)) || DEFAULT_PARAMS[k];
  }
  return out;
}

/* What the page is told about the connection. The key is not in it, its length
   is not in it, and neither is the base URL — a tenant's members can already
   read their own settings document, and ours is nobody's business. */
function fieldMapReport(conn) {
  return {
    source: conn.mapSource,
    confirmed: false,
    fields: Object.keys(defaultMap()).length,
    note: conn.mapSource === 'org-config'
      ? 'Mapped from this organisation\'s saved Crexi field map.'
      : 'Running on the BUILT-IN DEFAULTS. Every one of those field names is a '
      + 'guess written from public documentation, not confirmed against a live '
      + 'record. Run op:"probe" with one real listing and save the map before '
      + 'any of this reaches a customer.'
  };
}

/* ── who may spend ──────────────────────────────────────────────────────── */

/* billing/current → may this tenant reach the feed. An override wins either
   way, then the add-on, then the tier — parcel.js's shape for the same kind of
   decision, so there is one way to read an entitlement in this codebase. */
function tierEntitled(bill) {
  bill = bill || {};
  var ov = bill.toolOverrides || {};
  if (ov[OVERRIDE_KEY] === true) return true;
  if (ov[OVERRIDE_KEY] === false) return false;
  if (Array.isArray(bill.addons) && bill.addons.indexOf(LISTINGS_ADDON) >= 0) return true;
  return LISTINGS_TIERS.indexOf(String(bill.tier || '')) >= 0;
}

/* ABSENT IS NOT EMPTY. null means "whatever the plan includes"; a present array
   is authoritative at any length, including [] = nothing. The org-level
   allowlist on billing/current narrows the product; a member list may narrow it
   further but never widen it. CLAUDE.md records what the one-sided version
   cost — a colleague who auto-joined got all 41 tools. */
function toolAllowed(bill, member) {
  if (bill && bill.toolOverrides && bill.toolOverrides[TOOL_KEY] === false) return false;
  if (member && member.status && member.status !== 'active') return false;
  var org = bill && Array.isArray(bill.toolAccess) ? bill.toolAccess : null;
  var mine = member && Array.isArray(member.toolAccess) ? member.toolAccess : null;
  if (org && org.indexOf(TOOL_KEY) < 0) return false;
  if (mine && mine.indexOf(TOOL_KEY) < 0) return false;
  return true;
}

function dailyCap(bill) {
  var n = num(bill && bill.listingLookupsPerDay);
  if (n !== null && n >= 0) return Math.floor(n);
  n = num(process.env.LISTINGS_DAILY_CAP);
  if (n > 0) return Math.floor(n);
  return DAILY_DEFAULT;
}

/* The tenant record, the membership, the billing. Staff skip the tenant gates
   and still spend against their own org's allowance — a support lookup costs
   the same money a rep's does.

   IT FAILS OPEN ON A MISSING omega_orgs RECORD, and that is a departure from
   parcel.js worth stating. Every legacy tenant has no record until the seed
   runs; tenantActive() in the rules and omega-editor-gate.js both read absence
   as active for that reason, and getting it backwards locks out every paying
   customer. An EXPLICIT pending/suspended/cancelled still refuses. The metered
   gate below is what protects the spend, and it is a separate question. */
function entitle(caller, orgId, conn) {
  var db = A.db();
  return Promise.all([
    db.collection('omega_orgs').doc(orgId).get(),
    db.collection('omega_orgs').doc(orgId).collection('members').doc(caller.uid).get()
      .then(function (s) { return s.exists ? (s.data() || {}) : null; }),
    A.billingOf(orgId)
  ]).then(function (r) {
    var org = r[0].exists ? (r[0].data() || {}) : null;
    var member = r[1], bill = r[2] || {};
    var status = org ? (org.status || 'active') : 'active';

    if (!caller.staff) {
      if (status !== 'active') {
        throw A.httpError(403, 'this workspace is ' + status + ', so listing '
          + 'lookups are paused');
      }
      if (!toolAllowed(bill, member)) {
        throw A.httpError(403, 'Site Finder is not in this organisation\'s product');
      }
      /* An org running on its OWN agreement is spending its own money under
         its own contract; our tier list has nothing to say about it. Their
         daily cap still applies — it is there to stop a runaway loop, not to
         sell them anything. */
      if (conn.connected && !conn.probe && !conn.ownCredential && !tierEntitled(bill)) {
        throw A.httpError(403, 'listing enrichment is not part of this plan — '
          + 'it needs the "' + LISTINGS_ADDON + '" add-on, a ' + LISTINGS_TIERS[0]
          + ' plan or higher, or this organisation\'s own Crexi credential');
      }
    }
    return { bill: bill, cap: dailyCap(bill), orgStatus: status };
  });
}

/* ── the allowance ──────────────────────────────────────────────────────── */

function counterRef(orgId) {
  return A.db().collection('omega_orgs').doc(orgId)
    .collection('counters').doc(COUNTER_DOC);
}
function today() { return new Date().toISOString().slice(0, 10); }
function resetsAt() { return new Date(Date.parse(today() + 'T00:00:00Z') + 86400000).toISOString(); }

/* Read-only: what is left, for a response that is not spending. Never throws —
   an allowance we cannot read must not fail a call that costs nothing. */
function allowanceOf(orgId, cap) {
  return counterRef(orgId).get().then(function (s) {
    var d = s.exists ? (s.data() || {}) : {};
    var used = (d.day === today()) ? (num(d.lookups) || 0) : 0;
    return { day: today(), resetsAt: resetsAt(), cap: cap, used: used,
             remaining: Math.max(0, cap - used), counted: false };
  }, function () {
    return { day: today(), resetsAt: resetsAt(), cap: cap, used: null, remaining: null, counted: false,
             note: 'the counter could not be read' };
  });
}

/* Claim one. In a transaction because two tabs open the same card at the same
   moment, and a cap enforced by a read-then-write is not a cap. Called only on
   a path that will actually reach upstream — a cache hit is free and must not
   consume somebody's allowance. */
function claim(orgId, cap) {
  var ref = counterRef(orgId), db = A.db(), FV = A.FieldValue(), day = today();
  return db.runTransaction(function (tx) {
    return tx.get(ref).then(function (s) {
      var d = s.exists ? (s.data() || {}) : {};
      var used = (d.day === day) ? (num(d.lookups) || 0) : 0;
      if (used >= cap) {
        var err = A.httpError(429, 'today\'s listing-lookup allowance is spent; it resets at midnight UTC');
        err.allowance = { day: day, cap: cap, used: used, remaining: 0, resetsAt: resetsAt() };
        throw err;
      }
      tx.set(ref, { day: day, lookups: used + 1, updatedAt: FV.serverTimestamp() },
             { merge: true });
      return { day: day, resetsAt: resetsAt(), cap: cap, used: used + 1,
               remaining: Math.max(0, cap - used - 1), counted: true };
    });
  });
}

/* ── the cache ──────────────────────────────────────────────────────────── */

function cached(key, orgId) {
  return Promise.resolve().then(function () {
    return A.db().collection(CACHE).doc(key).get();
  }).then(function (s) {
    var d = s && s.exists ? s.data() : null;
    if (!d || d.orgId !== orgId || !d.hit || !(d.expiresAt > Date.now())) return null;
    return d.hit;
  }, function () { return null; });   /* the cache is a saving, not a source */
}
function remember(key, hit, orgId) {
  return Promise.resolve().then(function () {
    return A.db().collection(CACHE).doc(key).set({
      hit: hit, provider: PROVIDER, orgId: orgId,
      cachedAt: new Date().toISOString(), expiresAt: Date.now() + CACHE_TTL_MS
    });
  }).catch(function (e) {
    console.warn('[listings] cache write failed —', e && e.message);
  });
}

/* ── upstream ───────────────────────────────────────────────────────────── */

/* One JSON GET with a hard ceiling. The credential rides in a HEADER, never in
   the query string, so it cannot reach a log or a Referer. On a failure the
   error carries a status or 'timeout' and nothing else: an upstream error body
   is theirs, not ours, and must not be passed on.

   The header name and scheme are DEFAULTS — Authorization: Bearer is the common
   shape, not a confirmed fact about Crexi's API — and configuration overrides
   both. */
function getJson(url, conn) {
  var ctl = new AbortController();
  var timer = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);
  var headers = { 'Accept': 'application/json',
                  'User-Agent': 'ClearSky-OMEGA listings (https://clearskyomega.com)' };
  if (conn.key) {
    headers[conn.authHeader] = conn.authScheme ? (conn.authScheme + ' ' + conn.key) : conn.key;
  }
  return fetch(url, { method: 'GET', signal: ctl.signal, headers: headers, redirect: 'error' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (+r.headers.get('content-length') > 2097152) throw new Error('response too large');
      var reader = r.body.getReader(), chunks = [], bytes = 0;
      function read() {
        return reader.read().then(function (part) {
          if (part.done) return JSON.parse(Buffer.concat(chunks).toString('utf8'));
          bytes += part.value.byteLength;
          if (bytes > 2097152) { ctl.abort(); throw new Error('response too large'); }
          chunks.push(Buffer.from(part.value));
          return read();
        });
      }
      return read();
    })
    .then(function (j) { clearTimeout(timer); return j; },
          function (err) { clearTimeout(timer); throw err; });
}

/* The shapes omega-listings-source.js already accepts from this feed. Kept
   identical so a payload that works in the browser adapter works here. */
function rowsOf(j) {
  if (Array.isArray(j)) return j;
  if (!j || typeof j !== 'object') throw A.httpError(502, 'invalid listing response');
  var r = j.results || j.data || j.listings;
  if (!Array.isArray(r)) throw A.httpError(502, 'unrecognized listing response envelope');
  return r;
}
function oneOf(j) {
  if (Array.isArray(j)) return j[0] || null;
  if (!j || typeof j !== 'object') return null;
  if (j.result && typeof j.result === 'object') return j.result;
  if (['results', 'data', 'listings'].some(function (k) { return Object.prototype.hasOwnProperty.call(j, k); })) {
    var rows = rowsOf(j);
    return rows[0] || null;
  }
  return j;
}

function qs(pairs) {
  var out = [], i;
  for (i = 0; i < pairs.length; i++) {
    if (pairs[i][1] === null || pairs[i][1] === undefined || pairs[i][1] === '') continue;
    out.push(encodeURIComponent(pairs[i][0]) + '=' + encodeURIComponent(pairs[i][1]));
  }
  return out.join('&');
}

/* Upstream failures are NAMED. "The feed did not answer" and "there is nothing
   listed here" are different facts and a rep acts differently on each. */
function upstreamError(err) {
  var why = (err && err.name === 'AbortError')
    ? 'the listing feed did not answer in ' + Math.round(TIMEOUT_MS / 1000) + 's'
    : 'the listing feed request failed';
  return A.httpError(502, why + ' — this is NOT "nothing is listed here"');
}

/* ── ops ────────────────────────────────────────────────────────────────── */

function opSearch(b, ctx) {
  var bb = b.bbox || {};
  var n = num(bb.n), s = num(bb.s), e = num(bb.e), w = num(bb.w);
  if (n === null || s === null || e === null || w === null)
    throw A.httpError(400, 'bbox {n,s,e,w} is required as four finite numbers');
  if (!(n >= -90 && n <= 90 && s >= -90 && s <= 90 && e >= -180 && e <= 180 && w >= -180 && w <= 180))
    throw A.httpError(400, 'bbox is outside the world');
  if (!(n > s) || !(e > w))
    throw A.httpError(400, 'bbox is inverted — n must exceed s and e must exceed w');
  if ((e - w) > MAX_BBOX_LON || (n - s) > MAX_BBOX_LAT)
    throw A.httpError(400, 'zoom in — that view is ' + (e - w).toFixed(1) + ' by '
      + (n - s).toFixed(1) + ' degrees and the feed is billed per call');

  var types = [], i, t;
  if (Array.isArray(b.types)) {
    for (i = 0; i < b.types.length && i < 20; i++) {
      t = clean(b.types[i], 40);
      if (t) types.push(t);
    }
  }
  var limit = Math.floor(Math.min(MAX_LIMIT, Math.max(1, num(b.limit) || DEFAULT_LIMIT)));
  var minSqft = Math.max(0, num(b.minSqft) || 0);
  var P = ctx.conn.params;
  var url = ctx.conn.base + ctx.conn.searchPath + '?' + qs([
    [P.minLat, s], [P.maxLat, n], [P.minLon, w], [P.maxLon, e],
    [P.types, types.join(',')], [P.minSqft, minSqft], [P.limit, limit]
  ]);

  /* A viewport search bills only under some agreements. Claim when the org says
     theirs does; otherwise report the allowance without touching it. */
  var gate = ctx.conn.searchBilled ? claim(ctx.orgId, ctx.cap)
                                   : allowanceOf(ctx.orgId, ctx.cap);
  return gate.then(function (allow) {
    return getJson(url, ctx.conn).then(function (j) {
      var rows = rowsOf(j), out = [], k, rec;
      var noPoint = 0, noSize = 0;
      for (k = 0; k < rows.length && out.length < limit; k++) {
        rec = toNormalized(rows[k], ctx.conn.map);
        if (!rec) { noPoint++; continue; }
        if (rec.lat === null || rec.lon === null) { noPoint++; continue; }
        if (rec.lat < s || rec.lat > n || rec.lon < w || rec.lon > e) continue;
        /* A size filter cannot be satisfied by a building whose size we do not
           have, so the record is dropped — but the COUNT is reported. Unknown
           is not zero and it is not a small building either; a rep filtering
           at 50,000 sqft deserves to know that eleven sites were set aside
           because the feed carried no area for them, which is usually a
           mapping fault rather than a market fact. */
        if (minSqft && !(rec.sqft >= minSqft)) { if (rec.sqft === null) noSize++; continue; }
        modelLoad(rec);
        out.push(rec);
      }
      if (rows.length && noPoint === rows.length)
        throw A.httpError(502, 'listing field map did not yield coordinates');
      console.log('[listings]', ctx.orgId, 'search', out.length + '/' + rows.length,
                  'in', (e - w).toFixed(2) + 'x' + (n - s).toFixed(2),
                  ctx.conn.mapSource, ctx.conn.keyFrom || 'keyless');
      return {
        listings: out, count: out.length, returned: rows.length,
        /* Exactly the limit back means there is probably more out there. Said,
           rather than left for somebody to infer from a round number. */
        truncated: rows.length >= limit,
        dropped: { noCoordinate: noPoint, noBuildingSize: noSize },
        /* The type filter is passed UPSTREAM and not re-applied here: their
           vocabulary is theirs, ours is LS.TYPES, and re-filtering on a
           normalised type would silently discard anything normType() reads as
           "Other". Echoed so the page can say what it asked for rather than
           implying this list was filtered on our side. */
        typesRequested: types,
        allowance: allow,
        /* The provenance audit the shared module already writes. Coverage per
           field, which numbers are modelled, and a named FAULT when one field
           is empty on every record — which is a mapping error, not absent data,
           and is exactly what a wrong guess looks like at scale. */
        audit: LS.audit(out)
      };
    }).catch(function (err) { var failure = upstreamError(err); failure.allowance = allow; failure.spent = !!allow.counted; throw failure; });
  });
}

function opDetail(b, ctx) {
  var addr = [b.address, b.city, b.state, b.zip].map(function (v) { return clean(v, 300); }).filter(Boolean).join(', ');
  var id = clean(b.listingId, 120);
  var lat = num(b.lat), lon = num(b.lon);
  var key, P = ctx.conn.params, url;

  if (lat !== null && !(lat >= -90 && lat <= 90)) throw A.httpError(400, 'lat is out of range');
  if (lon !== null && !(lon >= -180 && lon <= 180)) throw A.httpError(400, 'lon is out of range');

  if (id) key = cacheKey('l', id);
  else if (addr && clean(b.address, 300)) key = cacheKey('a', addr);
  else if (lat !== null && lon !== null) key = cacheKey('p', lat.toFixed(5) + ',' + lon.toFixed(5));
  else throw A.httpError(400, 'detail needs an address, a listingId, or lat and lon');
  key = crypto.createHash('sha256').update(JSON.stringify([
    ctx.orgId, ctx.conn.base, ctx.conn.detailPath, ctx.conn.map, ctx.conn.params, ctx.conn.key,
    id, addr, lat, lon
  ])).digest('hex');

  url = ctx.conn.base + ctx.conn.detailPath + '?' + qs([
    [P.id, id], [P.q, id ? '' : addr],
    [P.lat, lat === null ? '' : lat], [P.lon, lon === null ? '' : lon]
  ]);

  return cached(key, ctx.orgId).then(function (hit) {
    if (hit) {
      console.log('[listings]', ctx.orgId, 'detail', key, 'from cache (free)');
      return allowanceOf(ctx.orgId, ctx.cap).then(function (allow) {
        return { found: true, listing: hit, cache: 'hit', allowance: allow };
      });
    }
    /* Claimed BEFORE the call, because the call is what costs. A lookup that
       comes back with nothing listed still spent one — it reached upstream. */
    return claim(ctx.orgId, ctx.cap).then(function (allow) {
      return getJson(url, ctx.conn).then(function (j) {
        var raw = oneOf(j);
        var rec = raw ? toNormalized(raw, ctx.conn.map) : null;
        if (raw != null && !rec) throw A.httpError(502, 'invalid listing record');

        if (!rec) {
          /* NOT cached. A feed that was down must not become "not on the
             market" for a day. */
          return { found: false, listing: null, cache: 'miss', allowance: allow,
                   reason: 'nothing on the market at that address in this feed. '
                         + 'Crexi covers what is LISTED; an owner-occupied '
                         + 'building that has never been listed is not here, '
                         + 'and that is most of the target set.' };
        }
        /* A record with no address and no id is a shape this field map did not
           understand, not a building. Reporting it as "nothing listed" would be
           a false statement about the market instead of a true one about the
           mapping, and it is the exact failure op:"probe" exists to catch. */
        if (!rec.addr && !rec.id) {
          throw A.httpError(502, 'listing field map did not yield an identity');
        }
        modelLoad(rec);
        return remember(key, rec, ctx.orgId).then(function () {
          console.log('[listings]', ctx.orgId, 'detail', key, 'billed 1,',
                      allow.remaining, 'left today');
          return { found: true, listing: rec, cache: 'miss', allowance: allow };
        });
      }).catch(function (err) { var failure = upstreamError(err); failure.allowance = allow; failure.spent = true; throw failure; });
    });
  });
}

/* THE POINT OF THE WHOLE EXERCISE. Paste one real record, see what lands where,
   fix the map in the settings panel, and never touch this repo. Staff only: it
   accepts a payload and reflects it, and the useful reading of it is "which of
   their fields are we ignoring" — that is an integration console, not a tenant
   feature. Costs nothing: it calls no vendor and claims no allowance. */
function opProbe(b, ctx) {
  var sample = b.sample;
  if (typeof sample === 'string') {
    try { sample = JSON.parse(sample); }
    catch (e) { throw A.httpError(400, 'sample is a string but not JSON: ' + clean(e.message, 120)); }
  }
  var wasArray = false;
  if (Array.isArray(sample)) {
    if (!sample.length) throw A.httpError(400, 'sample is an empty array');
    wasArray = true;
    sample = sample[0];   /* one record, and the caller is told that is what ran */
  }
  if (!sample || typeof sample !== 'object')
    throw A.httpError(400, 'sample must be ONE raw record from the feed, as an object');
  if (JSON.stringify(sample).length > MAX_SAMPLE_BYTES)
    throw A.httpError(400, 'sample is larger than ' + Math.round(MAX_SAMPLE_BYTES / 1024)
      + 'KB — send one record, not a page of them');

  var rep = LS.mapReport(sample, ctx.conn.map);
  return {
    usedFirstOfArray: wasArray,
    filled: rep.filled,
    empty: rep.empty,
    unused: rep.unused,
    /* mapReport inspects TOP-LEVEL keys only, so a nested object this map reads
       one branch of counts as used and its siblings stay invisible here. Said
       out loud, because the unread list is where the useful thing usually is. */
    unusedNote: 'Top-level keys only. A nested object this map reads one branch '
              + 'of will not appear, so open the nested ones by hand.',
    defaults: defaultMap(),
    orgMap: ctx.conn.map,
    preview: modelLoad(toNormalized(sample, ctx.conn.map)),
    mapper: usingSharedMapper() ? 'omega-listings-source.js fromCrexi'
                                : 'api/listings.js mirror (fromCrexi is not exported)',
    saveTo: 'toolData/' + ctx.orgId + '/prefs/apiSettings -> data.crexi.map'
  };
}

/* ── handler ────────────────────────────────────────────────────────────── */

module.exports = A.handler(function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  if (!LS || typeof LS.mapReport !== 'function') {
    /* Named, not swallowed. Without the shared module there is no field map and
       no energy table, and inventing either here is the thing this file exists
       to refuse. */
    throw A.httpError(500, 'omega-listings-source.js did not load — no field map '
      + 'and no energy table, so nothing here can be answered honestly');
  }
  var b = (req.body && typeof req.body === 'object') ? req.body : {};
  var op = clean(b.op, 20).toLowerCase();
  if (['search', 'detail', 'probe'].indexOf(op) < 0)
    throw A.httpError(400, 'op must be one of search, detail, probe');

  return A.authenticate(req).then(function (caller) {
    var orgId = A.safeOrg(b.orgId || caller.orgId);
    /* Staff may act in another org for support. safeOrg() is the ONE definition
       of that shape and exists because .doc() takes multi-segment paths — an
       unvalidated org from a body is a path-injection primitive. */
    if (caller.staff && b.orgId) {
      orgId = A.safeOrg(b.orgId);
      if (!orgId) throw A.httpError(400, 'orgId is not a domain');
    }
    if (!orgId) throw A.httpError(403, 'no organisation on this account');
    if (op === 'probe' && !caller.staff)
      throw A.httpError(403, 'probe is a ClearSky integration tool');

    /* Keyed on the org, because the org is the unit that spends. */

    /* No Firestore: no per-org config, no cache, and — the reason this refuses
       rather than degrading the way parcel.js can — no counter, so the daily
       cap cannot be enforced. Spending uncapped is worse than not spending. */
    if (A.isDegraded && A.isDegraded()) {
      throw A.httpError(503, 'the server has no Firestore credential ('
        + A.degradedReason() + '), so the daily lookup cap cannot be enforced — '
        + 'refusing rather than spending uncapped');
    }

    return A.canActInOrg(caller, orgId).then(function (allowed) {
      if (!allowed) throw A.httpError(403, 'not your workspace');
      E.rateLimit('listings:' + op + ':' + orgId, PER_MIN[op]);
      return orgSettings(orgId);
    }).then(function (cfg) {
      var conn = op === 'probe' ? { connected: false, probe: true, map: cleanMap(cfg.map), mapSource: cfg.map ? 'org-config' : 'defaults', missing: [] } : connection(cfg);
      return entitle(caller, orgId, conn).then(function (ent) {
      var envelope = {
        ok: true, op: op, provider: PROVIDER, orgId: orgId,
        source: PROVIDER, spent: false, record: null, asOf: new Date().toISOString(),
        connected: conn.connected,
        credential: conn.keyFrom
          ? (conn.keyFrom === 'org' ? 'this organisation\'s own'
                                    : 'the platform credential')
          : (conn.keyWithheld
              ? 'withheld — the endpoint is configured by the tenant, so the '
                + 'platform credential is not sent'
              : 'none sent — the endpoint is expected to hold it'),
        fieldMap: fieldMapReport(conn)
      };

      if (!conn.connected && op !== 'probe') {
        /* listings is NULL, not []. An empty array renders as an empty
           corridor, and a rep reading an empty corridor as "no opportunity
           here" is the outcome this tool exists to prevent. */
        envelope.connected = false;
        envelope.ok = false;
        envelope.listings = null;
        envelope.listing = null;
        envelope.reason = conn.disabled
          ? 'The Crexi feed is switched off for this organisation in its settings.'
          : 'The Crexi feed is not configured, so nothing was asked. This is NOT '
          + '"no listings here" — nothing was looked up.';
        envelope.missing = conn.missing;
        envelope.fix = conn.missing.length
          ? 'Set ' + conn.missing.join(' and ') + ' in the Vercel environment, or '
          + 'put this organisation\'s own endpoint on toolData/' + orgId
          + '/prefs/apiSettings -> crexi.'
          : 'Enable the feed on toolData/' + orgId + '/prefs/apiSettings -> crexi.';
        return allowanceOf(orgId, ent.cap).then(function (a) { envelope.allowance = a; return envelope; });
      }

        var ctx = { orgId: orgId, conn: conn, cap: ent.cap, caller: caller };
        var run = op === 'search' ? opSearch(b, ctx)
                : op === 'detail' ? opDetail(b, ctx)
                : Promise.resolve(opProbe(b, ctx));
        return Promise.resolve(run).then(function (out) {
          var k;
          for (k in out) {
            if (Object.prototype.hasOwnProperty.call(out, k)) envelope[k] = out[k];
          }
          if (op === 'detail') {
            envelope.ok = out.found === true;
            envelope.record = out.listing || null;
            envelope.spent = out.cache !== 'hit';
          } else if (op === 'search') envelope.spent = !!(out.allowance && out.allowance.counted);
          if (!envelope.allowance) {
            return allowanceOf(orgId, ent.cap).then(function (a) {
              envelope.allowance = a;
              return envelope;
            });
          }
          return envelope;
        });
      });
    });
  }).catch(function (err) {
    if (err && err.allowance) {
      res.status(err.status === 429 ? 429 : 502).json({ error: err.status === 429 ? err.message : 'the listing feed failed; no market conclusion is available',
        spent: !!err.spent, source: PROVIDER, allowance: err.allowance });
      return;
    }
    if (err && err.status && err.status < 500) throw err;
    if (err && err.status === 502) throw A.httpError(502, 'the listing feed failed; no market conclusion is available');
    throw A.httpError(503, 'the listing service is unavailable or its server configuration is incomplete');
  });
});

/* ── THE SEAM ────────────────────────────────────────────────────────────
   Pure and runnable with no network and no credential, for a test that does
   not need Firebase: the cache key, the address fold, the SSRF check on a
   tenant-supplied base URL, the connection resolver and the
   credential-withholding rule, the entitlement readings, and the mirror of
   fromCrexi that exists only until that function is exported.

   The three ops are here too. opProbe is pure end to end; opSearch and opDetail
   validate everything BEFORE they touch Firestore or the network, so the bbox
   guard and the "what may identify a listing" rule are both testable without a
   credential — and the bbox guard is the one that decides whether a pan can
   bill a fortune.

   Same shape as api/parcel.js's _helpers and api/compute-lease.js's _model. */
module.exports._helpers = {
  opSearch: opSearch, opDetail: opDetail, opProbe: opProbe,
  num: num, clean: clean, fnv: fnv,
  normAddr: normAddr, cacheKey: cacheKey,
  defaultMap: defaultMap, cleanMap: cleanMap, resolved: resolved,
  toNormalized: toNormalized, usingSharedMapper: usingSharedMapper,
  modelLoad: modelLoad,
  safeBase: safeBase, connection: connection, paramNames: paramNames,
  fieldMapReport: fieldMapReport,
  tierEntitled: tierEntitled, toolAllowed: toolAllowed, dailyCap: dailyCap,
  rowsOf: rowsOf, oneOf: oneOf, qs: qs, upstreamError: upstreamError,
  LS: LS,
  TOOL_KEY: TOOL_KEY, LISTINGS_TIERS: LISTINGS_TIERS, LISTINGS_ADDON: LISTINGS_ADDON,
  CACHE: CACHE, CACHE_TTL_MS: CACHE_TTL_MS, COUNTER_DOC: COUNTER_DOC,
  DAILY_DEFAULT: DAILY_DEFAULT, PER_MIN: PER_MIN,
  MAX_BBOX_LON: MAX_BBOX_LON, MAX_BBOX_LAT: MAX_BBOX_LAT,
  DEFAULT_PARAMS: DEFAULT_PARAMS, TIMEOUT_MS: TIMEOUT_MS,
  DEFAULT_SEARCH_PATH: DEFAULT_SEARCH_PATH, DEFAULT_DETAIL_PATH: DEFAULT_DETAIL_PATH
};
