/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/site-lookup.js — the facts a pro forma needs from an address

   POST /api/proforma { action:'site', address:{street, city, state, zip},
                        solar:{kwDc, tilt, azimuth} | false, keys:{nrel, urdb} }
   → where the site is, its state tax, whether it sits in an energy community
     or a low-income tract, what a rooftop array there produces, and which
     utility serves it with which demand-charge tariffs.

   Each answer lands on the page as a SUGGESTION with its source beside it
   (CONTRACT §7.3): the user applies it or not. That is why every block names
   its source and date, and why a failed lookup is 'unknown' — never 'no'. A
   financing team reads "energy community: no" as a fact about the site; an
   outage must not be able to say it.

   WHERE EACH ANSWER COMES FROM, AND WHY THAT ONE
   - Location: the US Census geocoder, vintage Census2020_Current. Every
     Treasury energy-community table is keyed on 2020 counties and tracts;
     the default vintage answers Connecticut in its 2022 planning regions and
     would miss every Connecticut table row.
   - Energy community and low income: tables bundled beside this file
     (data/, built by scripts/build-energy-communities.js from Treasury's and
     the program's own spreadsheets). NOT the DOE/NETL ArcGIS layers: those
     still serve Notice 2024-48 and are wrong for hundreds of counties and
     coal tracts under Notice 2026-39. A lookup is a key read — no network.
   - Solar: PVWatts v8 on developer.nlr.gov (developer.nrel.gov no longer
     resolves), with the C&I rooftop defaults the spec verified.
   - Utility: OpenEI URDB v8, detail=full, effective today, newest first.
     Without effective_on_date the first LADWP answer is a rate that ended in
     2016. The NLR utility_rates v3 average price is 2012 data and is not
     used, so avgCommercialRate is null by design: an average $/kWh is a
     property of a load shape, and the pro forma models the bill from the
     tariff.
   - State tax: the finance engine's own STATE_TAX table, so the suggestion
     and the model can never disagree.

   KEYS. Server env first (NREL_API_KEY — NLR_API_KEY is read as its new
   name — and OPENEI_API_KEY), then the user's own from OMEGASettings sent
   with this request, then DEMO_KEY, which both hosts honour at 10 requests
   an hour for the whole deployment. keyUsed says which. A key travels ONLY
   in the X-Api-Key header (api.data.gov reads it there; verified live), so
   it never sits in a URL, a log line or an upstream error; it is never
   stored, never logged, and the result is scrubbed for it before return.

   TIME. Vercel gives the function 30 s. The geocoder gets 15 s and one retry
   on a 5xx or no answer inside a 20 s budget (it has returned a 502 after
   11 s and then answered at once); everything after it runs in parallel
   with 6 s each. Worst case ≈ 26 s, inside the limit with room to respond.

   ONE ADDRESS PER REQUEST. A lookup spends the platform's shared quota on
   three public APIs; a list of addresses is a batch job, and this is not
   the door for one.

   THE QUOTA IS SHARED, SO IT IS COUNTED. One tenant looping on this must not
   switch tariff and solar suggestions off for every other one. lookup()
   therefore needs to know who is asking (opts.who, the verified orgId and
   uid; without it the call is refused, not run uncounted) and allows
   ORG_PER_HOUR lookups per workspace and USER_PER_MINUTE per person,
   sliding windows, before any request leaves. Past either cap it resolves
   { ok:false, status:429, retryAfter } and the handler answers 429. An
   identical lookup by the same workspace within CACHE_MS (same address,
   same solar size and angles, same kind of key) is answered from memory
   and spends neither quota nor allowance; only a result in which every
   source answered is kept, so a failure is never replayed. The cache is
   per workspace on purpose: a shared one would tell a tenant, by a fast
   answer, that somebody else had just looked at that site.

   ⚠ BOTH LIVE IN MODULE MEMORY, PER WARM INSTANCE. Vercel runs many
   instances, so the real ceiling is the limit times the instances, and a
   burst spread across cold starts is not limited at all. It is a speed
   bump, not a hard cap: it stops the case that happens — one page or script
   looping against one warm instance — and makes a repeat free. A durable
   per-org cap needs a counter written in a transaction (what embed-layout
   does for Regrid), and this endpoint cannot write: it runs on
   verify-token, as the caller, with no service account. The money-costing
   call has the durable cap; this one is free public data, so the trade is
   the same one api/_lib/embed.js makes for its reads.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var engine = require('./proforma-engine');
var EC_SA = require('./data/ec_statistical_2026.json');
var EC_CC = require('./data/ec_coal_tracts_v5.json');
var LIC = require('./data/lic_cat1_2026.json');

var GEOCODER = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';
var PVWATTS = 'https://developer.nlr.gov/api/pvwatts/v8.json';
var URDB = 'https://api.openei.org/utility_rates';
var URDB_VIEW = 'https://apps.openei.org/IURDB/rate/view/';
var LIC_MAP = 'https://experience.arcgis.com/experience/12227d891a4d471497ac13f60fffd822';

var GEOCODE_MS = 15000;          // one attempt
var GEOCODE_BUDGET_MS = 20000;   // both attempts together
var LOOKUP_MS = 6000;            // each lookup after the geocode, retries included
var RETRY_FLOOR_MS = 2500;       // a retry with less time than this cannot finish
var DEMO_KEY = 'DEMO_KEY';
var STALE_TARIFF_MONTHS = 18;
var MAX_RATES = 5;

var MINUTE_MS = 60000, HOUR_MS = 3600000;
var ORG_PER_HOUR = 30;           // one workspace, all its people
var USER_PER_MINUTE = 10;        // one person: a stuck button, not a day's work
var CACHE_MS = HOUR_MS;          // public data that changes yearly; one window
var CACHE_MAX = 500;             // answers held at once, oldest out first
var TRACKED_MAX = 5000;          // orgs + people counted at once; see sweep()

/* PVWatts inputs for a commercial rooftop (SPEC §4): premium modules, 14 %
   system losses, fixed roof mount at 10° facing south, DC/AC 1.2, 96 %
   inverter. The page may change tilt and azimuth; the rest is the basis the
   deck states. The weather dataset is PVWatts' default (NSRDB) and is not
   sent, so the request is exactly the one verified live. */
var PV_DEFAULTS = { module_type: 1, losses: 14, array_type: 1, tilt: 10, azimuth: 180,
  dc_ac_ratio: 1.2, inv_eff: 96, dataset: 'nsrdb', timeframe: 'monthly' };

/* The states the engine has a rate for, plus the territories where the
   credits apply and the geocoder answers; a territory gets no state rate. */
var TERRITORIES = ['PR', 'GU', 'VI', 'AS', 'MP'];

/* ── small helpers ───────────────────────────────────────────────────────── */

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function trim(s) { return String(s).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, ''); }
function num(v) { return typeof v === 'number' && isFinite(v); }
function round(v, dp) { var f = Math.pow(10, dp || 0); return Math.round(v * f) / f; }
/* Text from an upstream body: control characters out, length capped. It is
   shown to the user, so it is also scrubbed of any key before that. */
function clean(v, max) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return trim(String(v).replace(/[\u0000-\u001f\u007f<>]+/g, ' ')).slice(0, max || 160);
}
function isoDay(unixSec) {
  return num(unixSec) && unixSec > 0 ? new Date(unixSec * 1000).toISOString().slice(0, 10) : null;
}
function meta(t) { return isObj(t.meta) ? t.meta : {}; }

/* ── the request ─────────────────────────────────────────────────────────── */

/* Letters (with the accented Latin a US street name can carry), digits and
   the punctuation addresses use. No ; or newline, so one field cannot carry
   a second address; no < > or double quotes, so nothing here is markup. */
var STREET_RE = /^[A-Za-z0-9\u00C0-\u024F .,#'\u2019&\/()\-]+$/;
var CITY_RE = /^[A-Za-z0-9\u00C0-\u024F .'\u2019\-]+$/;
var ZIP_RE = /^\d{5}(-\d{4})?$/;
var KEY_RE = /^[A-Za-z0-9_\-]{8,128}$/;

function bad(field, error) { return { ok: false, field: field, error: error }; }

function field(v, name, min, max, re, what) {
  if (typeof v !== 'string') return bad('address.' + name, 'Enter the ' + what + '.');
  /* Before whitespace is tidied, or a newline would pass as a space. */
  if (/[\u0000-\u001f\u007f]/.test(v)) return bad('address.' + name, 'The ' + what + ' has characters an address does not use.');
  var s = trim(v);
  if (s.length < min) return bad('address.' + name, 'Enter the ' + what + '.');
  if (s.length > max) return bad('address.' + name, 'The ' + what + ' is longer than ' + max + ' characters.');
  if (!re.test(s) || !/[A-Za-z0-9]/.test(s)) return bad('address.' + name, 'The ' + what + ' has characters an address does not use.');
  return { ok: true, value: s };
}

function numberIn(v, lo, hi) { return num(v) && v >= lo && v <= hi; }

/* body → { ok:true, request } or { ok:false, field, error }. Pure. */
function validate(body) {
  if (!isObj(body)) return bad('address', 'Send the site address.');
  if (Array.isArray(body.address) || has(body, 'addresses'))
    return bad('address', 'One address per lookup.');
  var a = body.address;
  if (!isObj(a)) return bad('address', 'Send the site address as street, city, state and zip.');

  var street = field(a.street, 'street', 3, 100, STREET_RE, 'street address');
  if (!street.ok) return street;
  var city = field(a.city, 'city', 2, 60, CITY_RE, 'city');
  if (!city.ok) return city;
  var st = typeof a.state === 'string' ? trim(a.state).toUpperCase() : '';
  if (!has(engine.STATE_TAX, st) && TERRITORIES.indexOf(st) < 0)
    return bad('address.state', 'Use the two-letter state code, e.g. CA.');
  var zip = '';
  if (a.zip !== undefined && a.zip !== null && a.zip !== '') {
    zip = typeof a.zip === 'string' || typeof a.zip === 'number' ? trim(String(a.zip)) : '';
    if (!ZIP_RE.test(zip)) return bad('address.zip', 'The ZIP code should be 5 digits (or ZIP+4).');
  }

  var solar = { kwDc: 1, perKw: true, tilt: PV_DEFAULTS.tilt, azimuth: PV_DEFAULTS.azimuth };
  if (body.solar === false) solar = false;
  else if (body.solar !== undefined && body.solar !== null) {
    if (!isObj(body.solar)) return bad('solar', 'solar must be {kwDc, tilt, azimuth} or false.');
    var s = body.solar;
    /* PVWatts' own ranges: 0.05 kW to 500 MW, tilt 0–90°, azimuth 0–360°. */
    if (s.kwDc !== undefined && s.kwDc !== null) {
      if (!numberIn(s.kwDc, 0.05, 500000)) return bad('solar.kwDc', 'Solar size must be between 0.05 and 500,000 kW DC.');
      solar.kwDc = s.kwDc;
      solar.perKw = false;
    }
    if (s.tilt !== undefined && s.tilt !== null) {
      if (!numberIn(s.tilt, 0, 90)) return bad('solar.tilt', 'Tilt must be between 0 and 90 degrees.');
      solar.tilt = s.tilt;
    }
    if (s.azimuth !== undefined && s.azimuth !== null) {
      if (!numberIn(s.azimuth, 0, 359.999)) return bad('solar.azimuth', 'Azimuth must be from 0 up to 360 degrees (180 = south).');
      solar.azimuth = s.azimuth;
    }
  }

  /* The user's own keys. A malformed one is set aside with a warning rather
     than failing the lookup: the location facts do not need it. */
  var keys = {}, keyWarnings = [];
  if (isObj(body.keys)) {
    ['nrel', 'urdb'].forEach(function (k) {
      var v = body.keys[k];
      if (v === undefined || v === null || v === '') return;
      var s2 = typeof v === 'string' ? trim(v) : '';
      if (KEY_RE.test(s2)) keys[k] = s2;
      else keyWarnings.push('The ' + (k === 'nrel' ? 'NREL' : 'OpenEI') + ' key in Settings is not in the expected format, so it was not used.');
    });
  }

  return { ok: true, request: {
    address: { street: street.value, city: city.value, state: st, zip: zip },
    oneLine: street.value + ', ' + city.value + ', ' + st + (zip ? ' ' + zip : ''),
    solar: solar, keys: keys, keyWarnings: keyWarnings
  } };
}

/* ── keys ────────────────────────────────────────────────────────────────── */

/* env → the user's → DEMO_KEY. `used` is what the page shows; the key
   itself is only ever handed to getJson as a header. */
function pickKey(kind, env, userKeys) {
  var fromEnv = kind === 'nrel' ? (env.NREL_API_KEY || env.NLR_API_KEY) : env.OPENEI_API_KEY;
  fromEnv = typeof fromEnv === 'string' ? trim(fromEnv) : '';
  if (fromEnv) return { key: fromEnv, used: 'env' };
  if (userKeys[kind]) return { key: userKeys[kind], used: 'user' };
  return { key: DEMO_KEY, used: 'demo' };
}

/* ── HTTP ────────────────────────────────────────────────────────────────── */

/* One GET that always resolves, never rejects:
   { status, json, error:null|'timeout'|'network'|'malformed', retryAfter, ms }.
   AbortController cancels the socket where there is one; the timer settles
   the promise either way, so a fetch that ignores the signal cannot hold the
   function open. The body is read inside the same deadline. */
function getOnce(fetchFn, url, headers, ms) {
  var t0 = Date.now();
  return new Promise(function (resolve) {
    var settled = false;
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    function done(r) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      r.ms = Date.now() - t0;
      resolve(r);
    }
    var timer = setTimeout(function () {
      if (ctl) { try { ctl.abort(); } catch (e) { /* already settled */ } }
      done({ status: 0, json: null, error: 'timeout', retryAfter: null });
    }, ms);
    var init = { method: 'GET', headers: headers };
    if (ctl) init.signal = ctl.signal;
    Promise.resolve().then(function () { return fetchFn(url, init); }).then(function (res) {
      var ra = res && res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null;
      return res.text().then(function (txt) {
        var j = null;
        try { j = JSON.parse(txt); } catch (e) { /* not JSON */ }
        done({ status: res.status, json: j, error: j === null ? 'malformed' : null, retryAfter: ra });
      });
    }).then(null, function (e) {
      done({ status: 0, json: null, error: e && e.name === 'AbortError' ? 'timeout' : 'network', retryAfter: null });
    });
  });
}

/* Retry once on no answer or a 5xx — never on a 4xx or a 429, which
   another attempt only spends more quota on — and only while the budget can
   still cover a real attempt. */
function getJson(fetchFn, url, headers, attemptMs, budgetMs, retryFloorMs) {
  var start = Date.now();
  function go(retriesLeft) {
    var left = budgetMs - (Date.now() - start);
    return getOnce(fetchFn, url, headers, Math.min(attemptMs, left)).then(function (r) {
      var again = r.status === 0 || r.status >= 500;
      var leftAfter = budgetMs - (Date.now() - start);
      if (again && retriesLeft > 0 && leftAfter >= retryFloorMs) {
        return go(retriesLeft - 1).then(function (r2) { r2.retried = true; return r2; });
      }
      return r;
    });
  }
  return go(1);
}

function qs(o) {
  return Object.keys(o).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&');
}

/* ── location ────────────────────────────────────────────────────────────── */

function geocode(fetchFn, oneLine, T) {
  var url = GEOCODER + '?' + qs({ address: oneLine, benchmark: 'Public_AR_Current',
    vintage: 'Census2020_Current', layers: 'Census Tracts,Counties,States', format: 'json' });
  return getJson(fetchFn, url, { accept: 'application/json' }, T.geocodeMs, T.geocodeBudgetMs, T.retryFloorMs).then(function (r) {
    var m = r.json && r.json.result && r.json.result.addressMatches;
    if (r.status !== 200 || !Array.isArray(m)) {
      return { geo: null, error: r.error === 'timeout' ? 'The Census geocoder did not answer in time; try again.'
        : r.status === 200 ? 'The Census geocoder sent a response that could not be read; try again.'
        : r.status ? 'The Census geocoder answered HTTP ' + r.status + '; try again in a minute.'
          : 'The Census geocoder could not be reached; try again.' };
    }
    if (!m.length) return { geo: null, error: 'The Census geocoder found no match for this address; check the street number and ZIP.' };
    var g = isObj(m[0].geographies) ? m[0].geographies : {};
    var tract = (g['Census Tracts'] || [])[0] || {}, county = (g.Counties || [])[0] || {}, state = (g.States || [])[0] || {};
    var c = m[0].coordinates || {};
    if (!num(c.x) || !num(c.y)) return { geo: null, error: 'The Census geocoder matched the address but returned no coordinates.' };
    var tractGeoid = /^\d{11}$/.test(tract.GEOID) ? tract.GEOID : null;
    var countyFips = /^\d{5}$/.test(county.GEOID) ? county.GEOID : null;
    return { geo: {
      lat: c.y, lon: c.x,
      matchedAddress: clean(m[0].matchedAddress, 160),
      state: /^[A-Z]{2}$/.test(state.STUSAB) ? state.STUSAB : null,
      countyFips: countyFips, countyName: clean(county.NAME, 80) || null,
      tractGeoid: tractGeoid,
      candidates: m.length,
      source: 'US Census Geocoder (Public_AR_Current, 2020 census geography)'
    }, error: null };
  });
}

/* ── energy community (bundled Treasury tables) ──────────────────────────── */

var MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
function sinceIso(text) {
  var m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})$/i.exec(trim(text || ''));
  if (!m || !MONTHS[m[1].toLowerCase()]) return null;
  return m[3] + '-' + MONTHS[m[1].toLowerCase()] + '-' + (m[2].length < 2 ? '0' : '') + m[2];
}
function pct(v) { return String(round(v, 2)) + '%'; }

/* Connecticut's vintage-2 areas are its 2022 planning regions (county codes
   110–190), which a 2020 county GEOID cannot name. If none of them
   qualifies — true under Notice 2026-39 — a vintage-1 miss is a full "no";
   if one ever does, the honest answer for Connecticut is "unknown". */
function ctRegionQualifies() {
  var k;
  for (k in EC_SA.counties) if (has(EC_SA.counties, k) && /^091\d\d$/.test(k)) return true;
  return false;
}

function energyCommunity(geo) {
  var sm = meta(EC_SA), cm = meta(EC_CC);
  var effective = sm.effective || EC_SA.effective || '';
  var out = {
    status: 'unknown',
    categories: [],
    source: 'Treasury energy-community tables for ' + (sm.notice || 'IRS Notice 2026-39') +
      ' (statistical area, effective ' + effective + '; coal-closure tracts, cumulative list)',
    asOf: { notice: sm.notice || 'IRS Notice 2026-39', effective: effective,
      dataVintage: sm.dataVintage || '', coalList: EC_CC.source || '', builtAt: sm.builtAt || cm.builtAt || null },
    note: 'Location screen only. Brownfield sites are a third category, and that status is site-specific ' +
      '(a Phase I/II assessment or a CERCLA §101(39) determination), so it cannot be mapped and is not checked here. ' +
      'Status is tested when the project is placed in service, or when construction begins if the project relies on ' +
      'the beginning-of-construction rule. Confirm with tax counsel.'
  };
  if (!geo) return out;

  var unknown = [];
  var sa = geo.countyFips ? EC_SA.counties[geo.countyFips] : null;
  if (!geo.countyFips) unknown.push('the geocoder returned no county');
  if (sa) {
    var both = sa.v1 && sa.v2;
    var area = sa.v2 ? sa.msa2 || sa.msa1 : sa.msa1 || sa.msa2;
    var ur = sa.v2 ? sa.ur2 : sa.ur1;
    var nat = EC_SA.nationalRate2025;
    out.categories.push({
      kind: 'statistical-area',
      label: 'Statistical area: ' + clean(area, 120) + ' — ' + (sm.unemploymentYear ? sm.unemploymentYear + ' ' : '') +
        'unemployment ' + pct(ur) + ' against ' + pct(nat) + ' nationally, and the fossil-fuel employment test met' +
        (both ? '' : ' (under the vintage ' + (sa.v1 ? '1' : '2') + ' area delineation)'),
      year: parseInt(String(effective).slice(0, 4), 10) || null,
      effective: effective || null,
      area: clean(area, 120),
      unemploymentPct: ur, nationalPct: nat,
      vintages: sa.v1 && sa.v2 ? [1, 2] : [sa.v1 ? 1 : 2]
    });
  } else if (geo.countyFips && geo.countyFips.slice(0, 2) === '09' && ctRegionQualifies()) {
    unknown.push('Connecticut\'s vintage-2 areas are planning regions, which a 2020 county cannot name');
  }

  var cc = geo.tractGeoid ? EC_CC.tracts[geo.tractGeoid] : null;
  if (!geo.tractGeoid) unknown.push('the geocoder returned no census tract');
  if (cc) {
    var since = sinceIso(cc.since);
    out.categories.push({
      kind: 'coal-closure',
      label: 'Coal closure: ' + clean(cc.type, 80).toLowerCase() + ' tract (eligible since ' + clean(cc.since, 20) + ')',
      year: since ? parseInt(since.slice(0, 4), 10) : null,
      since: since,
      tractType: clean(cc.type, 80),
      tract: geo.tractGeoid
    });
  }

  if (out.categories.length) out.status = 'yes';
  else if (unknown.length) {
    out.status = 'unknown';
    out.note = 'Could not finish the check: ' + unknown.join('; ') + '. ' + out.note;
  } else out.status = 'no';

  if (sa) {
    out.note = 'The statistical-area list is re-issued every June on the prior year\'s unemployment; this one applies from ' +
      effective + ' until the next notice. ' + out.note;
  }
  return out;
}

/* ── low-income community, §48E(h) Category 1 (bundled program table) ────── */

function lowIncome(geo) {
  var lm = meta(LIC);
  var out = {
    status: 'unknown',
    source: 'Low-Income Communities Bonus Credit Program, Category 1 (NMTC low-income tracts, 2016–2020 ACS), January 2026 data',
    asOf: { notice: lm.notice || 'Low-Income Communities Bonus Credit Program data, January 2026',
      dataVintage: lm.dataVintage || '', builtAt: lm.builtAt || null },
    tract: null,
    tractPct: null,
    note: 'Screening only; the program publishes this data for geolocation, not as an eligibility determination. ' +
      'The §48E(h) bonus is never automatic: the project needs a capacity allocation from the program, the bonus is for ' +
      'solar (and wind) under 5 MW AC, and battery storage is not eligible.'
  };
  if (!geo) return out;
  if (!geo.tractGeoid) {
    out.note = 'The geocoder returned no census tract, so the tract could not be checked. ' + out.note;
    return out;
  }

  /* The table is in 2025 tracts. Outside Connecticut those are the 2020
     GEOIDs; Connecticut's changed county code, so they are matched on the
     six-digit tract code through the index the build writes. */
  var id = geo.tractGeoid;
  if (id.slice(0, 2) === '09') {
    var mapped = LIC.ctTracts && LIC.ctTracts[id.slice(5)];
    if (!mapped) {
      out.note = 'Connecticut tract ' + id + ' has no match in the program\'s 2025 tracts; check the site on the program map (' + LIC_MAP + '). ' + out.note;
      return out;
    }
    id = mapped;
  }
  var share = has(LIC.pctCategory1, id) ? LIC.pctCategory1[id] : 0;
  out.tract = id;
  out.tractPct = share;
  if (share >= 100) out.status = 'yes';
  else if (share <= 0) out.status = 'no';
  else {
    /* The qualifying boundary splits this tract, so the answer depends on
       which side the site is on. Saying yes or no would be a guess. */
    out.status = 'unknown';
    out.note = pct(share) + ' of this tract\'s land is in a Category 1 area, so it depends on the exact site; check it on the program map (' +
      LIC_MAP + '). ' + out.note;
  }
  return out;
}

/* ── state tax ───────────────────────────────────────────────────────────── */

function tax(state) {
  var fed = engine.defaults().tax.federalPct;
  var s = has(engine.STATE_TAX, state) ? engine.STATE_TAX[state] : null;
  return {
    state: state,
    statePct: s,
    federalPct: fed,
    /* State tax is deductible federally, the engine's default. */
    combinedPct: s === null ? null : round(fed + s * (1 - fed / 100), 4),
    source: '2026 state corporate rates (engine table)'
  };
}

/* ── solar: PVWatts v8 ───────────────────────────────────────────────────── */

var KEY_WHO = { env: 'the platform\'s', user: 'your', demo: 'the shared demo' };

/* An upstream refusal in words, from its status and code — never from its
   message verbatim, which can carry a signup link for a host that no longer
   exists. */
function refusal(service, r, who, T) {
  var code = r.json && isObj(r.json.error) && /^[A-Z_]{3,40}$/.test(r.json.error.code) ? r.json.error.code : '';
  if (r.error === 'timeout') return service + ' did not answer within ' + round(T.lookupMs / 1000, 1) + ' s.';
  if (r.status === 0) return service + ' could not be reached.';
  if (r.status === 429 || code === 'OVER_RATE_LIMIT') {
    var secs = parseInt(r.retryAfter, 10);
    var wait = !(secs > 0) ? '' : secs < 5400 ? Math.max(1, Math.round(secs / 60)) + ' min' : Math.round(secs / 3600) + ' h';
    return service + ': ' + KEY_WHO[who] + ' key is over its rate limit' +
      (wait ? '; try again in about ' + wait : '') +
      (who === 'demo' ? '. The demo key allows 10 requests an hour for the whole platform; add your own free key in Settings.' : '.');
  }
  if (r.status === 403 && code === 'API_KEY_MISSING') return service + ' needs an API key.';
  if (r.status === 403 || code === 'API_KEY_INVALID' || code === 'API_KEY_DISABLED')
    return service + ' refused ' + KEY_WHO[who] + ' key' + (code ? ' (' + code + ')' : '') + (who === 'user' ? '; check it in Settings.' : '.');
  if (r.error === 'malformed') return service + ' sent a response that could not be read (HTTP ' + r.status + ').';
  if (code) return service + ' returned an error (' + code + ').';
  return service + ' answered HTTP ' + r.status + '.';
}

function solar(fetchFn, geo, req, pick, T) {
  var params = {
    system_capacity: req.kwDc, module_type: PV_DEFAULTS.module_type, losses: PV_DEFAULTS.losses,
    array_type: PV_DEFAULTS.array_type, tilt: req.tilt, azimuth: req.azimuth,
    dc_ac_ratio: PV_DEFAULTS.dc_ac_ratio, inv_eff: PV_DEFAULTS.inv_eff,
    lat: round(geo.lat, 6), lon: round(geo.lon, 6), timeframe: PV_DEFAULTS.timeframe
  };
  return getJson(fetchFn, PVWATTS + '?' + qs(params), { accept: 'application/json', 'X-Api-Key': pick.key },
    T.lookupMs, T.lookupMs, T.retryFloorMs).then(function (r) {
    var j = r.json, o = j && j.outputs;
    if (r.status === 422 && j && Array.isArray(j.errors) && j.errors.length) {
      return { solar: null, error: 'PVWatts refused the request: ' + clean(j.errors[0], 200) };
    }
    if (r.status !== 200 || !j || (Array.isArray(j.errors) && j.errors.length) || !isObj(o) || !num(o.ac_annual) ||
        !Array.isArray(o.ac_monthly) || o.ac_monthly.length !== 12 || !o.ac_monthly.every(num)) {
      return { solar: null, error: r.status === 200 && !r.error ? 'PVWatts returned no production for this location.' : refusal('PVWatts', r, pick.used, T) };
    }
    var st = isObj(j.station_info) ? j.station_info : {};
    var warnings = [];
    if (num(st.distance) && st.distance > 10000) {
      warnings.push('The PVWatts weather station is ' + round(st.distance / 1000, 1) + ' km from the site; production is less certain than usual.');
    }
    return { solar: {
      kwDc: req.kwDc,
      perOneKw: !!req.perKw,
      kwhAnnual: Math.round(o.ac_annual),
      kwhPerKwDc: round(o.ac_annual / req.kwDc, 1),
      monthly: o.ac_monthly.map(function (v) { return Math.round(v); }),
      capacityFactorPct: num(o.capacity_factor) ? round(o.capacity_factor, 2) : null,
      source: 'NREL PVWatts v8',
      params: { systemCapacityKwDc: req.kwDc, moduleType: 'premium', lossesPct: PV_DEFAULTS.losses, arrayType: 'fixed roof mount',
        tilt: req.tilt, azimuth: req.azimuth, dcAcRatio: PV_DEFAULTS.dc_ac_ratio, inverterEffPct: PV_DEFAULTS.inv_eff,
        dataset: 'NSRDB TMY', basis: 'year-1 AC energy, before degradation' },
      station: { distanceKm: num(st.distance) ? round(st.distance / 1000, 1) : null,
        weatherData: clean(st.weather_data_source, 80) || null },
      keyUsed: pick.used
    }, warnings: warnings };
  });
}

/* ── utility and tariffs: URDB v8 ────────────────────────────────────────── */

/* $/kW of a structure's periods, rate + adj (URDB's price rule), counting
   only the periods a schedule actually uses: a TOU period defined but never
   scheduled is not a charge anybody pays. */
function maxCharge(structure, periodsUsed) {
  var best = 0, p, t;
  if (!Array.isArray(structure)) return 0;
  for (p = 0; p < structure.length; p++) {
    if (periodsUsed && !periodsUsed[p]) continue;
    var tiers = Array.isArray(structure[p]) ? structure[p] : [];
    for (t = 0; t < tiers.length; t++) {
      var x = tiers[t] || {};
      var v = (num(x.rate) ? x.rate : 0) + (num(x.adj) ? x.adj : 0);
      if (v > best) best = v;
    }
  }
  return best;
}
function periodsIn(schedules) {
  var used = null;
  schedules.forEach(function (s) {
    if (!Array.isArray(s)) return;
    s.forEach(function (row) {
      if (!Array.isArray(row)) return;
      row.forEach(function (p) { if (num(p)) { used = used || {}; used[p] = true; } });
    });
  });
  return used;
}

function summarizeRate(x) {
  var tou = maxCharge(x.demandratestructure, periodsIn([x.demandweekdayschedule, x.demandweekendschedule]));
  var flat = maxCharge(x.flatdemandstructure, Array.isArray(x.flatdemandmonths) ? periodsIn([[x.flatdemandmonths]]) : null);
  var label = /^[0-9a-f]{24}$/.test(x.label) ? x.label : '';
  var uri = typeof x.uri === 'string' && x.uri.indexOf(URDB_VIEW) === 0 && /^[\w:\/.\-]+$/.test(x.uri) ? x.uri : '';
  return {
    label: label,
    name: clean(x.name, 160),
    hasDemand: tou > 0 || flat > 0,
    url: label ? URDB_VIEW + label : uri,
    startDate: isoDay(x.startdate),
    demandChargeMaxPerKw: tou > 0 ? round(tou, 2) : null,
    facilityChargeMaxPerKw: flat > 0 ? round(flat, 2) : null,
    fixedMonthly: num(x.fixedchargefirstmeter) && x.fixedchargeunits === '$/month' ? x.fixedchargefirstmeter : null,
    minKw: num(x.peakkwcapacitymin) ? x.peakkwcapacitymin : null,
    maxKw: num(x.peakkwcapacitymax) ? x.peakkwcapacitymax : null,
    isDefault: x.is_default === true,
    _start: num(x.startdate) ? x.startdate : 0,
    _demand: tou + flat
  };
}

function utility(fetchFn, geo, pick, nowSec, T) {
  var params = { version: 8, format: 'json', sector: 'Commercial', approved: 'true', detail: 'full',
    lat: round(geo.lat, 6), lon: round(geo.lon, 6), effective_on_date: nowSec,
    orderby: 'startdate', direction: 'desc', limit: 60 };
  return getJson(fetchFn, URDB + '?' + qs(params), { accept: 'application/json', 'X-Api-Key': pick.key },
    T.lookupMs, T.lookupMs, T.retryFloorMs).then(function (r) {
    var items = r.json && r.json.items;
    if (r.status !== 200 || !Array.isArray(items) || (r.json && r.json.error)) {
      return { utility: null, error: refusal('The Utility Rate Database', r, pick.used, T) };
    }
    /* Still in force today: effective_on_date should already say so, and
       URDB carries records with no end date that are long superseded. */
    var current = items.filter(function (x) {
      return isObj(x) && typeof x.utility === 'string' && x.utility &&
        !(num(x.enddate) && x.enddate > 0 && x.enddate <= nowSec);
    });
    if (!current.length) return { utility: null, error: 'The Utility Rate Database has no current commercial rates for this location.' };

    /* One point can sit in two service territories (a municipal inside an
       IOU's map). The utility with the most current rates is named; the
       others are listed, not dropped. */
    var byUtility = {}, order = [];
    current.forEach(function (x) {
      if (!byUtility[x.utility]) { byUtility[x.utility] = []; order.push(x.utility); }
      byUtility[x.utility].push(x);
    });
    order.sort(function (a, b) { return byUtility[b].length - byUtility[a].length; });
    var name = order[0], mine = byUtility[name];

    var rates = mine.map(summarizeRate);
    rates.sort(function (a, b) {
      return (b.hasDemand - a.hasDemand) || (b.isDefault - a.isDefault) || (b._start - a._start) ||
        (b._demand - a._demand) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    });
    var withDemand = rates.filter(function (x) { return x.hasDemand; });
    var shown = (withDemand.length ? withDemand : rates).slice(0, MAX_RATES);
    var newest = 0;
    mine.forEach(function (x) { if (num(x.startdate) && x.startdate > newest) newest = x.startdate; });

    var warnings = [];
    if (!withDemand.length) warnings.push('None of ' + clean(name, 120) + '\'s current commercial rates in the Utility Rate Database has a demand charge.');
    if (newest && nowSec - newest > STALE_TARIFF_MONTHS * 30.44 * 86400) {
      warnings.push('The newest ' + clean(name, 120) + ' commercial rate in the Utility Rate Database starts ' + isoDay(newest) +
        '; check the utility\'s current tariff book before relying on it.');
    }
    if (items.length >= params.limit) {
      warnings.push('The Utility Rate Database returned its first ' + params.limit + ' current rates here; the newest are shown.');
    }
    return { utility: {
      name: clean(name, 120),
      eiaId: num(mine[0].eiaid) ? mine[0].eiaid : null,
      avgCommercialRate: null,
      rates: shown.map(function (x) { delete x._start; delete x._demand; return x; }),
      ratesFound: mine.length,
      newestStart: isoDay(newest),
      otherUtilities: order.slice(1).map(function (u) { return clean(u, 120); }),
      source: 'OpenEI Utility Rate Database (URDB) v8, commercial rates in effect ' + isoDay(nowSec),
      note: 'Rates with demand charges come first. Match the rate to the host\'s bill; the minimum and maximum kW say which service size each applies to.',
      keyUsed: pick.used
    }, warnings: warnings };
  });
}

/* ── the shared quota: counted per org and per person, repeats cached ────── */

function inWords(secs) { return secs < 90 ? secs + ' s' : Math.round(secs / 60) + ' min'; }

/* A limiter and a cache with their own memory, so a test can hold a fresh
   one on a fake clock; the endpoint uses GUARD, the module's own. The maps
   have no prototype: orgId and uid come from a verified token, but a key
   spelled __proto__ must still be only a key. */
function createGuard(limits) {
  limits = isObj(limits) ? limits : {};
  function limit(k, d) { return num(limits[k]) && limits[k] > 0 ? limits[k] : d; }
  var L = { orgPerHour: limit('orgPerHour', ORG_PER_HOUR), userPerMinute: limit('userPerMinute', USER_PER_MINUTE),
    cacheMs: limit('cacheMs', CACHE_MS), cacheMax: limit('cacheMax', CACHE_MAX) };
  var orgs = Object.create(null), users = Object.create(null), answers = Object.create(null);

  /* The times still inside the window, oldest first; an emptied key goes. */
  function recent(map, k, windowMs, now) {
    var t = map[k] || [], i = 0;
    while (i < t.length && t[i] <= now - windowMs) i++;
    if (i) t = t.slice(i);
    if (t.length) map[k] = t; else delete map[k];
    return t;
  }
  /* Whole seconds until a slot opens; 0 when one is free now. */
  function waitFor(t, cap, windowMs, now) {
    if (t.length < cap) return 0;
    return Math.max(1, Math.ceil((t[t.length - cap] + windowMs - now) / 1000));
  }
  /* The maps grow with people, not with requests, but are still bounded:
     swept when large rather than on a timer, so an idle instance does
     nothing. */
  function sweep(now) {
    if (Object.keys(orgs).length + Object.keys(users).length < TRACKED_MAX) return;
    Object.keys(orgs).forEach(function (k) { recent(orgs, k, HOUR_MS, now); });
    Object.keys(users).forEach(function (k) { recent(users, k, MINUTE_MS, now); });
  }

  /* who → null when this lookup may go out (and it is counted), or
     { retryAfter, error }. Both windows are checked before either is
     charged, so a refusal costs nothing: a person hammering retry does not
     eat the rest of the workspace's hour. The longer wait is the one named. */
  function take(who, now) {
    sweep(now);
    var u = recent(users, who.uid, MINUTE_MS, now), o = recent(orgs, who.orgId, HOUR_MS, now);
    var wu = waitFor(u, L.userPerMinute, MINUTE_MS, now), wo = waitFor(o, L.orgPerHour, HOUR_MS, now);
    if (wo && wo >= wu) {
      return { retryAfter: wo, error: 'This workspace has run ' + L.orgPerHour + ' site lookups in the last hour, ' +
        'the most one workspace may; try again in about ' + inWords(wo) + '.' };
    }
    if (wu) {
      return { retryAfter: wu, error: 'That is ' + L.userPerMinute + ' site lookups in a minute, the most one person may; ' +
        'try again in ' + inWords(wu) + '.' };
    }
    users[who.uid] = u.concat([now]);
    orgs[who.orgId] = o.concat([now]);
    return null;
  }

  /* Held as JSON and parsed on the way out, so a caller that edits its copy
     cannot edit the next caller's. */
  function get(key, now) {
    var e = answers[key];
    if (!e) return null;
    if (!(now >= e.at && now - e.at < L.cacheMs)) { delete answers[key]; return null; }
    return JSON.parse(e.json);
  }
  /* Keys iterate in insertion order, so the first is the oldest; a re-put
     moves its key to the back. */
  function put(key, value, now) {
    delete answers[key];
    answers[key] = { at: now, json: JSON.stringify(value) };
    var ks = Object.keys(answers), i = 0;
    while (ks.length - i > L.cacheMax) delete answers[ks[i++]];
  }

  return { take: take, get: get, put: put };
}
var GUARD = createGuard();

/* What makes two lookups the same answer: the workspace, the address as
   validated (so spacing and case do not split it), the solar request, and
   which KIND of key each service would use, since the result says which.
   Never the key itself. Validated fields carry no control characters, so a
   newline cannot be forged into a second field. */
function cacheKey(who, req, nrel, urdb) {
  var s = req.solar ? [req.solar.perKw ? 'per-kw' : req.solar.kwDc, req.solar.tilt, req.solar.azimuth].join(',') : 'no-solar';
  return [who.orgId, req.oneLine.toLowerCase(), s, nrel.used, urdb.used].join('\n');
}

function isId(v) { return typeof v === 'string' && v.length > 0; }

/* ── the lookup ──────────────────────────────────────────────────────────── */

/* Every key that went out on this request, scrubbed from the result as a
   last line: nothing above puts one in, and this makes that a guarantee. */
function scrub(result, secrets) {
  var s = JSON.stringify(result), i, changed = false;
  for (i = 0; i < secrets.length; i++) {
    if (secrets[i] && secrets[i] !== DEMO_KEY && s.indexOf(secrets[i]) >= 0) {
      s = s.split(secrets[i]).join('[key removed]');
      changed = true;
    }
  }
  return changed ? JSON.parse(s) : result;
}

/* body (the POST) → Promise of the §7.3 result, { ok:false, field, error }
   for a request that cannot be looked up, or { ok:false, status:429,
   retryAfter, error } past the quota. Never rejects for an upstream
   failure: each lookup fails into its own errors entry.
   opts: { who:{orgId, uid} (required), fetch, env, now (ms), timeouts,
   guard } — who is counted against the quota; the rest are injectable for
   tests. now is the clock for both the tariff date and the quota; timeouts
   exists so a test of a hung upstream does not take six real seconds;
   guard is a createGuard() so a test does not share the module's. */
function lookup(body, opts) {
  opts = opts || {};
  var who = isObj(opts.who) ? opts.who : null;
  /* Refused, not run uncounted: a caller that forgot to say who is asking
     would otherwise be the one door around the quota. */
  if (!who || !isId(who.orgId) || !isId(who.uid)) {
    return Promise.reject(new Error('site-lookup: lookup() needs opts.who { orgId, uid } to count the shared quota'));
  }
  var v = validate(body);
  if (!v.ok) return Promise.resolve(v);
  var req = v.request;
  var fetchFn = opts.fetch || (typeof fetch === 'function' ? fetch : null);
  var env = opts.env || process.env;
  var now = num(opts.now) ? opts.now : Date.now();
  var nowSec = Math.floor(now / 1000);
  var nrel = pickKey('nrel', env, req.keys), urdb = pickKey('urdb', env, req.keys);
  var guard = opts.guard || GUARD;
  var key = cacheKey(who, req, nrel, urdb);

  /* A repeat is free: no request, no charge. A malformed-key warning belongs
     to THIS request, so it is stored off and put back per caller. */
  var seen = guard.get(key, now);
  if (seen) {
    seen.warnings = req.keyWarnings.concat(Array.isArray(seen.warnings) ? seen.warnings : []);
    return Promise.resolve(seen);
  }
  var over = guard.take(who, now);
  if (over) return Promise.resolve({ ok: false, status: 429, retryAfter: over.retryAfter, field: null, error: over.error });
  var t = isObj(opts.timeouts) ? opts.timeouts : {};
  var T = {
    geocodeMs: num(t.geocodeMs) ? t.geocodeMs : GEOCODE_MS,
    geocodeBudgetMs: num(t.geocodeBudgetMs) ? t.geocodeBudgetMs : GEOCODE_BUDGET_MS,
    lookupMs: num(t.lookupMs) ? t.lookupMs : LOOKUP_MS,
    retryFloorMs: num(t.retryFloorMs) ? t.retryFloorMs : RETRY_FLOOR_MS
  };

  var result = {
    ok: true,
    geo: null,
    tax: tax(req.address.state),
    energyCommunity: null,
    lowIncome: null,
    solar: null,
    utility: null,
    warnings: req.keyWarnings.slice(),
    errors: {}
  };
  if (result.tax.statePct === null) {
    result.warnings.push('There is no state corporate rate on file for ' + req.address.state + '; enter it on the tax step.');
  }
  if (!fetchFn) {
    result.errors.geo = 'This server cannot make outbound requests.';
  }

  var located = fetchFn ? geocode(fetchFn, req.oneLine, T) : Promise.resolve({ geo: null, error: result.errors.geo });
  return located.then(function (g) {
    result.geo = g.geo;
    if (g.error) result.errors.geo = g.error;
    var skipped = 'Not checked: the address could not be located.';

    result.energyCommunity = energyCommunity(g.geo);
    result.lowIncome = lowIncome(g.geo);
    if (!g.geo) {
      result.errors.energyCommunity = skipped;
      result.errors.lowIncome = skipped;
      if (req.solar) result.errors.solar = skipped;
      result.errors.utility = skipped;
      return result;
    }
    if (g.geo.candidates > 1) {
      result.warnings.push('The address matched ' + g.geo.candidates + ' places; the first, ' + g.geo.matchedAddress + ', was used. Check it.');
    }
    if (g.geo.state && g.geo.state !== req.address.state) {
      result.warnings.push('The address was matched in ' + g.geo.state + ', not ' + req.address.state +
        ' as entered; the state tax uses ' + req.address.state + '. Check the address.');
    }

    return Promise.all([
      req.solar ? solar(fetchFn, g.geo, req.solar, nrel, T) : Promise.resolve({ solar: null }),
      utility(fetchFn, g.geo, urdb, nowSec, T)
    ]).then(function (r) {
      result.solar = r[0].solar;
      if (r[0].error) result.errors.solar = r[0].error;
      result.utility = r[1].utility;
      if (r[1].error) result.errors.utility = r[1].error;
      result.warnings = result.warnings.concat(r[0].warnings || [], r[1].warnings || []);
      if (result.solar && nrel.used === 'demo') {
        result.warnings.push('Solar production used the shared demo key (10 requests an hour for the whole platform); add your own free NREL key in Settings.');
      }
      if (result.utility && urdb.used === 'demo') {
        result.warnings.push('Tariffs used the shared demo key (10 requests an hour for the whole platform); add your own free OpenEI key in Settings.');
      }
      return result;
    });
  }).then(function (res) {
    var out = scrub(res, [nrel.key, urdb.key]);
    /* Only an answer in which every source answered: a timeout or a 429
       kept for an hour would be an outage we manufactured. Scrubbed first,
       so no key is ever held. */
    if (!Object.keys(out.errors).length) {
      var keep = {}, k;
      for (k in out) if (has(out, k)) keep[k] = out[k];
      keep.warnings = out.warnings.slice(req.keyWarnings.length);
      guard.put(key, keep, now);
    }
    return out;
  });
}

module.exports = {
  lookup: lookup,
  validate: validate,
  createGuard: createGuard,
  /* For scripts/tests/tsitelookup.js: the pure parts. */
  _pure: { energyCommunity: energyCommunity, lowIncome: lowIncome, tax: tax, pickKey: pickKey,
    summarizeRate: summarizeRate, sinceIso: sinceIso, getJson: getJson },
  LIMITS: { GEOCODE_MS: GEOCODE_MS, GEOCODE_BUDGET_MS: GEOCODE_BUDGET_MS, LOOKUP_MS: LOOKUP_MS, RETRY_FLOOR_MS: RETRY_FLOOR_MS,
    ORG_PER_HOUR: ORG_PER_HOUR, USER_PER_MINUTE: USER_PER_MINUTE, CACHE_MS: CACHE_MS, CACHE_MAX: CACHE_MAX }
};
