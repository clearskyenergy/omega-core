/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   THE ONE LIST OF PUBLISHED HOSTING CAPACITY, SERVER-SIDE (DESIGN C6,
   2026-10-17, Tommy: "the circuit step must work across IL, FL, GA, NJ, AZ,
   CA, CT, MA, RI: identify the serving utility at the point, read its
   PUBLISHED hosting capacity where one exists, say plainly where none is
   published, and give the person the utility's own map to verify").

   One entry per investor-owned utility and large public power system in the
   nine states, each with its EIA ids, what it publishes, where, in which
   units, which layers must be read together, and how a raw row becomes a
   circuit. Every figure here was checked live on 2026-10-17 (the research
   and its adversarial verification are the source; where they disagreed the
   verification won); Arizona was checked again, utility by utility, on
   2026-10-20 (docs/HOSTING-ARIZONA.md: the list, the links, the terms);
   Texas was added, utility by utility, on 2026-10-28 (docs/HOSTING-TEXAS.md:
   no Texas utility publishes distribution hosting capacity, and the PUCT's
   own service-area layers are licensed to Platts MSA holders, so they are
   never queried). Pure
   CommonJS, ES5, no I/O: the door (api/hosting-capacity.js) does the asking.

   WHY IT IS SERVER-ONLY. ComEd answers only with its own viewer's Referer,
   which a browser cannot set; Eversource's navigator and National Grid's
   portal do not all send CORS headers; and the field maps and unit rules are
   the curated research (CLAUDE.md, IP protection). The browser gets the
   answer and, from GET /api/hosting-capacity?coverage=1, a projection that
   names utilities and statuses — never a URL and never a field.

   ComEd is named through api/_lib/comed-service.js (SERVICE, headers()),
   never a pasted URL: that file stays the one server-side ComEd constant.

   WHAT A STATUS MEANS
     verified   a point query returned features on 2026-10-17; read it.
     metadata   the service answers but no point query was proven.
     candidate  a layer exists whose units or provenance are unproven.
     account    published only to registered users; OMEGA never reads it.
     none       no hosting capacity is published; say so and link the
                utility's own process.

   WHAT A PERSON IS HANDED (publication(): the list the circuit step draws
   of every utility that may serve the point) is the status in words, the
   `route` the utility offers instead of a map (an Arizona Pre-Application
   Report, a co-op's engineering review), its own page (`viewerUrl`) and,
   where the utility publishes one for people, its own address lookup
   (`check`: SRP's, APS's Service Areas Viewer, Mesa's service-area map).
   Pages a person opens, never a service URL or a field.

   NORMALISATION (pinned by scripts/tests/thostingsources.js)
     units     everything leaves here in kW. MW × 1000; a kVA figure (LADWP)
               is carried as kW at unity and the note says kVA.
     strings   '0.38', '.2663', '5526.2 kW', 'Redacted' (= not published).
     lists     Ameren's comma lists line up by position, one circuit each.
     bands     'Less than 100 kW AC' -> {minKw:0,maxKw:100}; the low end is
               judged, never the high one.
     basis     storage = the published two-way figure, or min(gen, load);
               a generation-only figure is basis 'gen' and the verdict says
               the charging side is not published.
     queue     per source (`queue`): 'subtract' where the figure and the
               queue are published at the same grain and the figure is not
               proven net (ComEd, proven gross; ACE); 'netted' where it is
               proven net (PSE&G); 'context' where a SECTION figure sits
               beside a FEEDER queue (PG&E, National Grid, Eversource, RI,
               UI, Rockland — its QUEUED_DER is "Feeder DG In Queue (MW)"
               beside PV_SECTION, "Section Hosting Capacity"): no utility
               publishes that subtraction, so the queue is shown beside the
               figure, never taken from it, and queuedKw is null ("no queue
               is published with this figure"). Where none is published at
               all it is null too.
     restriction  a cap on the size of new DER (ACE's PHI_Restrictions_
               Public, 0/50/150/250/500 kW) is applied AFTER the queue is
               taken from the hosting figure: min(max(0, figure − queue),
               restriction). It is a per-project ceiling, not room the queue
               is counted against. */
'use strict';
var CS = require('./comed-service');

/* Cached rows carry this: a new release's rules never serve an old row.
   .2 (2026-10-17, review): Rockland's feeder queue is context, a JCP&L band
   survives storage mode, ACE's restriction caps after the queue, a group
   answers only for a utility of its own state, and no partial reading or
   one cut short by the time budget is ever kept.
   2026-10-20: Arizona utility by utility, and the City of Mesa's own
   service-area map in the territory (a cached territory answer for a Mesa
   point predates it).
   2026-10-28: Texas utility by utility (docs/HOSTING-TEXAS.md): every entry
   is `none`, each with the route its utility offers instead and the PUCT's
   own public boundary viewer as the person's check. */
var VERSION = 'hosting-sources-2026-10-28';
var VERIFIED_AT = '2026-10-17';
var AZ_VERIFIED_AT = '2026-10-20';
var TX_VERIFIED_AT = '2026-10-28';
var STATES = ['IL', 'FL', 'GA', 'NJ', 'AZ', 'CA', 'CT', 'MA', 'RI', 'TX'];
var MODES = ['storage', 'export', 'load'];
var DOE_ATLAS = 'https://www.energy.gov/eere/us-atlas-electric-distribution-system-hosting-capacity-maps';

/* Rough state rectangles (padded), only to tell "a utility we have
   researched, in a state we researched" from "the same utility elsewhere". */
var STATE_BOX = {
  IL: [36.92, -91.57, 42.56, -86.97], FL: [24.34, -87.69, 31.05, -79.92], GA: [30.31, -85.66, 35.05, -80.79],
  NJ: [38.88, -75.61, 41.41, -73.84], AZ: [31.28, -114.87, 37.05, -108.99], CA: [32.48, -124.53, 42.06, -114.08],
  CT: [40.93, -73.78, 42.10, -71.74], MA: [41.19, -73.56, 42.94, -69.88], RI: [41.10, -71.96, 42.07, -71.07],
  TX: [25.6, -107.0, 36.6, -93.4]
};

/* ── parse rules ─────────────────────────────────────────────────────── */
function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v).replace(/,/g, '').trim();
  if (!s || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
  var n = +s;
  return isFinite(n) ? n : null;
}
/* '3630.7 kW', '1.2 MW', '5526.2' (kW) */
function kwString(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+))\s*(kw|mw|kva|mva)?\b/i.exec(String(v == null ? '' : v).replace(/,/g, ''));
  if (!m) return null;
  var n = +m[1], u = (m[2] || 'kw').toLowerCase();
  return isFinite(n) ? (u === 'mw' || u === 'mva' ? n * 1000 : n) : null;
}
function toKw(v, unit) {
  var n = num(v);
  if (n == null) return null;
  return unit === 'MW' || unit === 'MVA' ? n * 1000 : n;
}
function list(v) {
  if (v === null || v === undefined) return [];
  return String(v).split(',').map(function (s) { return s.trim(); });
}
/* a published range, in the source's unit, to kW */
function band(v, unit) {
  if (v === null || v === undefined) return null;
  var s = String(v).replace(/,/g, '').trim(), k = unit === 'MW' || unit === 'MVA' ? 1000 : 1, m;
  if (!s) return null;
  if (/unavailable|not available|redacted|n\/a/i.test(s)) return null;
  if (/^no capacity$/i.test(s)) return { minKw: 0, maxKw: 0, text: s };
  if ((m = /^(?:less than|<)\s*([\d.]+)/i.exec(s))) return { minKw: 0, maxKw: +m[1] * k, text: s };
  if ((m = /^(?:greater than|more than|>)\s*([\d.]+)/i.exec(s))) return { minKw: +m[1] * k, maxKw: null, text: s };
  if ((m = /^([\d.]+)\s*(?:-|to|–)\s*([\d.]+)/.exec(s))) return { minKw: +m[1] * k, maxKw: +m[2] * k, text: s };
  return null;
}
/* '13.2KV', '4kV', '4.8-KV', '12', 13.8; Ameren subtransmission codes */
function kvOf(v) {
  if (v === null || v === undefined || v === '') return null;
  if (String(v) === '300') return 34.5;
  if (String(v) === '310') return 69;
  var m = /([\d.]+)/.exec(String(v));
  var n = m ? +m[1] : null;
  return n != null && isFinite(n) && n > 0 && n < 800 ? n : null;
}
function pad(n) { return n < 10 ? '0' + n : String(n); }
/* epoch ms, 'MM/DD/YYYY', '11/21/2025, 11:39 AM', '2026-10-05 00:00:00', 'Jun 2026' */
function dateOf(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && v > 1e11) { var d = new Date(v); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  var s = String(v).trim(), m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) return m[3] + '-' + pad(+m[1]) + '-' + pad(+m[2]);
  return s.slice(0, 20);
}
function str(v, n) { return v === null || v === undefined ? '' : String(v).trim().slice(0, n || 80); }
function nonNeg(n) { return n == null ? null : Math.max(0, n); }

/* ── geometry: distance from the point to what came back ────────────── */
var M_PER_DEG = 111320;
function xy(lat0, p) { return [(p[0]) * M_PER_DEG * Math.cos(lat0 * Math.PI / 180), p[1] * M_PER_DEG]; }
function segDist(p, a, b) {
  var dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  var x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
  return Math.sqrt(x * x + y * y);
}
function inRing(p, ring) {
  var inside = false, i, j;
  for (i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / ((yj - yi) || 1e-12) + xi)) inside = !inside;
  }
  return inside;
}
/* ArcGIS JSON geometry in WGS84 (outSR=4326): {x,y} | {paths} | {rings}. */
function distanceM(geom, lat, lng) {
  if (!geom || typeof geom !== 'object') return null;
  var p = xy(lat, [lng, lat]), best = Infinity, i, k;
  function pt(c) { return xy(lat, [c[0], c[1]]); }
  if (isFinite(geom.x) && isFinite(geom.y)) {
    var q = pt([geom.x, geom.y]); return Math.sqrt(Math.pow(q[0] - p[0], 2) + Math.pow(q[1] - p[1], 2));
  }
  var parts = geom.paths || geom.rings;
  if (!parts || !parts.length) return null;
  if (geom.rings) {
    var odd = false;
    for (i = 0; i < geom.rings.length; i++) if (inRing(p, geom.rings[i].map(pt))) odd = !odd;
    if (odd) return 0;
  }
  for (i = 0; i < parts.length; i++) {
    var line = parts[i].map(pt);
    for (k = 1; k < line.length; k++) best = Math.min(best, segDist(p, line[k - 1], line[k]));
    if (line.length === 1) best = Math.min(best, Math.sqrt(Math.pow(line[0][0] - p[0], 2) + Math.pow(line[0][1] - p[1], 2)));
  }
  return isFinite(best) ? best : null;
}
/* A service-area polygon at a point: is the point inside it (the odd rule,
   so a hole is outside), and how far is the nearest edge? A geocoded
   address can land a lot over, so a point near the edge is not the same
   answer as one well inside (utility-territory.js SERVICE_AREAS). */
function edgeOf(geom, lat, lng) {
  if (!geom || !geom.rings || !geom.rings.length) return null;
  var p = xy(lat, [lng, lat]), odd = false, best = Infinity, i, k;
  for (i = 0; i < geom.rings.length; i++) {
    var ring = geom.rings[i].map(function (c) { return xy(lat, [c[0], c[1]]); });
    if (inRing(p, ring)) odd = !odd;
    for (k = 1; k < ring.length; k++) best = Math.min(best, segDist(p, ring[k - 1], ring[k]));
  }
  return isFinite(best) ? { inside: odd, edgeM: best } : null;
}
function envelope(lat, lng, m) {
  var dLat = m / M_PER_DEG, dLng = m / (M_PER_DEG * Math.cos(lat * Math.PI / 180));
  return [(lng - dLng).toFixed(6), (lat - dLat).toFixed(6), (lng + dLng).toFixed(6), (lat + dLat).toFixed(6)].join(',');
}

/* ── row readers: one raw attribute row -> one (or several) parts ───────
   A part names what the row says about ONE circuit:
   { id, name, sub, kv, phase, refreshed, gen, load, storage, charge,
     discharge, genBand, loadBand, genQueue, loadQueue, capKw, capNote,
     upstream:{transformerKw, bankKw, substationKw, pnode}, flags:[] }
   Every kW figure is already kW. Missing is null, never 0. */
function part(o) { o.upstream = o.upstream || {}; o.flags = o.flags || []; return o; }

function readComEd(a) {
  return part({ id: str(a.Feeder || a.Feeder_N, 40), name: a.Feeder_N ? 'queue report ' + str(a.Feeder_N, 20) : '',
    sub: str(a.SS_N, 40), gen: num(a.PV_HC_kW), load: num(a.EV_HC_kW), storage: num(a.BESS_HC),
    genQueue: num(a.Feeder_Q), refreshed: dateOf(a.Queue_RD) });
}
/* Ameren: one 50 m cell (≈38 m on the ground) can touch several feeders,
   each list position its own circuit. Substation = the first three
   characters of the feeder id (the viewer's own Arcade). */
function amerenParts(ids, vals, kvs, key) {
  if (!ids.length || ids.length !== vals.length) return [];
  return ids.map(function (id, i) {
    var p = part({ id: str(id, 40), sub: str(id, 3), kv: kvOf(kvs[i] || kvs[0]) });
    p[key] = toKw(vals[i], 'MW');
    return p;
  }).filter(function (p) { return p.id; });
}
function readAmerenGen(a) {
  var out = amerenParts(list(a.FEEDERID), list(a.MAXGENMW_TXT), list(a.OPERATINGVOLTAGE), 'gen'), lim = list(a.GENLIMITER);
  out.forEach(function (p, i) { if (lim[i]) p.flags.push('generation limited by ' + lim[i]); });
  return out;
}
function readAmerenLoad(a) { return amerenParts(list(a.FEEDERID), list(a.MAXLOADMW_TXT), [], 'load'); }

/* PSE&G: TotalAvailabilitySymbol is the binding min(circuit, station), in
   kW; the popup shows a negative as 0. It is a fixed-ceiling saturation
   screen (1,200 kW at 4 kV, 5,000 kW at 13 kV, less installed and pending
   solar), so the queue is already in it. 26 kV and 'TF' rows carry nulls. */
function readPsegGen(a) {
  var tas = num(a.TotalAvailabilitySymbol), circ = num(a.circuitavailability);
  if (tas == null && circ == null) return null;
  var p = part({ id: str(a.BASE_CIRCUITID, 40), sub: str(a.stationname, 60), kv: kvOf(a.VVT_VOLTAGE),
    gen: nonNeg(tas != null ? tas : circ), genQueue: num(a.PendingSolar) });
  p.upstream.substationKw = nonNeg(num(a.stationavailability));
  if (/network/i.test(String(a.circuittype || ''))) p.flags.push('network circuit');
  return p;
}
function readPsegLoad(a) { return part({ id: str(a.EV_CID || a.base_circuitid, 40), load: nonNeg(toKw(a.CAPACITY_REMAINING, 'MW')) }); }

/* JCP&L: transformer points with one value and no circuit id. RemainNum
   under 100 is the display bucket 'Less than 100 kW AC', never a number. */
function readJcplGen(a) {
  var n = num(a.RemainNum), s = String(a.Remaining || '');
  if (n == null && !s) return null;
  if (/less than/i.test(s) || (n != null && n < 100)) return part({ id: '', name: 'nearest transformer point', genBand: band(/less than/i.test(s) ? s : 'Less than 100', 'kW') });
  return part({ id: '', name: 'nearest transformer point', gen: n });
}
function readJcplLoad(a) {
  var s = String(a.remaining == null ? '' : a.remaining).trim(), n = num(a.remainnum);
  if (/less than/i.test(s)) return part({ id: '', name: 'nearest transformer point', loadBand: band(s, 'kW') });
  if (n == null && (s === '' || s === ' ')) return null;
  return part({ id: '', name: 'nearest transformer point', load: n });
}

/* ACE (PHI): Allowable_PV_kW never applies the substation transformer
   limit, so the binding figure is the smaller of the two; a restriction on
   the feeder caps new DER further (PHI_Restrictions_Public), and it caps
   what is left AFTER the pending generation is taken off (normalize). */
function readAceGen(a) {
  var allow = num(a.Allowable_PV_kW), xf = num(a.Transformer_Large_Gen_HC);
  var p = part({ id: str(a.FeederID, 40), sub: str(a.Substation, 60), kv: kvOf(a.Voltage),
    gen: allow == null ? null : (xf == null ? allow : Math.min(allow, xf)),
    genQueue: num(a.Total_Pending_Gen_kW), refreshed: dateOf(a.Last_Updated) });
  p.upstream.transformerKw = xf;
  return p;
}
function readAceCap(a) {
  var kw = num(a.Restriction_kW);
  if (kw == null) return null;
  return part({ id: str(a.FEEDERID || a.Circuit, 40), capKw: kw,
    capNote: 'restricted to ' + kw + ' kW of new DER' + (a.Restriction_Category ? ' (category ' + str(a.Restriction_Category, 10) + ')' : '') });
}
function readAceLoad(a) { return part({ id: str(a.FEEDERID || a.Feeder, 40), sub: str(a.Substation, 60), load: nonNeg(toKw(a.Capacity_MW, 'MW')) }); }

/* Rockland Electric (O&R): MW throughout. The site value is the SECTION
   figure (PV_SECTION, SC_SECTION, SD_SECTION), not the feeder maxima. */
function readRecoGen(a) {
  return part({ id: str(a.CIRCUIT, 40), sub: str(a.SUBSTATION, 40), kv: kvOf(a.LOCAL_VOLTAGE),
    gen: toKw(a.PV_SECTION, 'MW'), genQueue: toKw(a.QUEUED_DER, 'MW'), refreshed: dateOf(a.HC_REFESH_DATE) });
}
function readRecoCharge(a) { return part({ id: str(a.CIRCUIT, 40), charge: toKw(a.SC_SECTION, 'MW'), refreshed: dateOf(a.STORAGE_UPDATEDATE) }); }
function readRecoDischarge(a) { return part({ id: str(a.CIRCUIT, 40), discharge: toKw(a.SD_SECTION, 'MW') }); }
function readRecoLoad(a) { return part({ id: str(a.CIRCUIT, 40), load: nonNeg(toKw(a.EV_HEADROOM, 'MW')) }); }

/* PG&E LineDetail: kW. The with-OpFlex generation figure binds a project
   that is not a limited-generation profile; 38% of sections are blank, so
   the nearest section WITH a value is read and a static-grid figure says so. */
function readPgeLine(a) {
  var of = num(a.GenCapacity_kW), st = num(a.GenCapacity_no_OpFlex_kW);
  var p = part({ id: str(a.FeederId, 40), name: str(a.FeederName, 60), kv: kvOf(a.voltage_kv),
    gen: of != null ? of : st, load: num(a.LoadCapacity_kW), refreshed: str(a.ICA_Analysis_Date, 20) || null });
  if (of == null && st != null) p.flags.push('generation is the static-grid figure (no OpFlex figure published here)');
  return p;
}
function readPgeFeeder(a) { return part({ id: str(a.FeederID, 40), sub: str(a.Substation, 60), genQueue: num(a.Queued_DG) }); }

/* SCE ICA: MW, mostly strings, and the OpFlex figure is 'Redacted' on a
   quarter of segments — the static-grid figure is read then, and said. */
function readSce(a) {
  var of = num(a.uniform_generation_op_flex), st = num(a.uniform_generation);
  var p = part({ id: str(a.circuit_name, 40), sub: str([a.substation_name, a.substation_voltage].filter(Boolean).join(' '), 60),
    kv: kvOf(a.circuit_voltage), gen: of != null ? of * 1000 : (st != null ? st * 1000 : null),
    load: toKw(a.ica_overall_load, 'MW'), refreshed: dateOf(a.changed_date) });
  if (of == null && st != null) p.flags.push('generation is the static-grid figure (the OpFlex figure is redacted)');
  return p;
}

/* SDG&E public grid views: MW; the Generation view carries the load figure
   too. Restricted (15/15) segments are left out, not flagged. */
function readSdge(a) {
  var gof = num(a.ICAWOF_UNIGENERATION), gst = num(a.ICAWNOF_UNIGENERATION), lof = num(a.ICAWOF_UNILOAD), lst = num(a.ICAWNOF_UNILOAD);
  var p = part({ id: str(a.CIRCUIT_NAME, 40), sub: str(a.SUBID, 60), kv: kvOf(a.VOLTAGE),
    gen: gof != null ? gof * 1000 : (gst != null ? gst * 1000 : null), load: lof != null ? lof * 1000 : (lst != null ? lst * 1000 : null) });
  if (gof == null && gst != null) p.flags.push('generation is the static-grid figure');
  return p;
}

/* LADWP: load (new-service) capacity only, as kVA ranges by line segment. */
function readLadwp(a) {
  var b = band(a.Capacity_Range_KW, 'kW');
  if (!b) return null;
  return part({ id: '', name: 'nearest line segment' + (a.Voltage_Class ? ' (' + str(a.Voltage_Class, 12) + ')' : ''),
    kv: kvOf(a.Voltage_Class), loadBand: b, flags: ['published in kVA, carried as kW at unity power factor'] });
}

/* United Illuminating: Calc_Location_HC is the binding location figure in
   kW = min(the section string, circuit available × 1000, substation
   remaining × 1000); the '… kW' string is the unconstrained section limit,
   read only when the figure is blank. */
function uiPart(a, key) {
  var calc = num(a.Calc_Location_HC);
  var p = part({ id: str(a.Circuit, 40), sub: str(a.Substation, 60), kv: kvOf(a.Operating_Voltage), phase: str(a.Phase, 4) });
  p[key] = calc != null ? nonNeg(calc) : nonNeg(kwString(a.Remaining_Load_Capacity));
  p.upstream.substationKw = toKw(a.Remaining_Capacity__MW_, 'MW');
  p.upstream.pnode = a.Transmission_PNode_ID ? 'ISO-NE pnode ' + str(a.Transmission_PNode_ID, 12) : null;
  return p;
}
function readUiCharge(a) { var p = uiPart(a, 'charge'); p.loadQueue = toKw(a.Queued_Capacity__MW_, 'MW'); return p; }
function readUiDischarge(a) { var p = uiPart(a, 'discharge'); p.genQueue = toKw(a.DER_in_Queue__MW_, 'MW'); return p; }
function readUiGen(a) { var p = uiPart(a, 'gen'); p.genQueue = toKw(a.DER_in_Queue__MW_, 'MW'); return p; }
function readUiLoad(a) { var p = uiPart(a, 'load'); p.loadQueue = toKw(a.Queued_Capacity__MW_, 'MW'); return p; }

/* Eversource's legacy MapServer: HOSTING_CAPACITY_MW is a section value in
   MW; 0.05 is the single-phase placeholder ("not studied"), never 50 kW.
   BULK_SUB_HC_MW is capped at the bulk substation's rating: a ceiling. */
function readEversourceLegacyGen(a) {
  var mw = num(a.HOSTING_CAPACITY_MW);
  var p = part({ id: str(a.CIRCUITID || a.NSTAR_CIRCUITID || a.CIRCUIT_NAME, 40), sub: str(a.BULK_SUB_NAME, 60),
    kv: kvOf(a.SECTION_OPERATING_VOLTAGE || a.OPERATING_VOLTAGE), genQueue: num(a.IN_QUEUE_DG_KW), refreshed: dateOf(a.DATE_UPDATED) });
  if (mw != null && Math.abs(mw - 0.05) < 1e-9) { p.gen = null; p.flags.push('single-phase section: not studied'); }
  else p.gen = mw == null ? null : mw * 1000;
  p.upstream.substationKw = toKw(a.BULK_SUB_HC_MW, 'MW');
  return p;
}
function readEversourceLegacyLoad(a) { return part({ id: str(a.CIRCUIT_NAME, 40), sub: str(a.SBSTA_NM, 60), kv: kvOf(a.VOLTAGE), load: toKw(a.FEEDER_CAPACITY_TO_MAP_MW, 'MW') }); }

/* National Grid MA: layer 2's primary_hc on the nearest segment is the site
   figure (MW); layer 0's feeder_max_hc is the feeder's best spot and is
   capped at 10 MW, so a 10 reads as "10 MW or more". */
function readNgPrimary(a) {
  var mw = num(a.primary_hc), p = part({ id: str(a.feeder_cdf, 40), kv: kvOf(a.primary_voltage) });
  if (mw != null && mw >= 10) p.genBand = { minKw: 10000, maxKw: null, text: '10 MW or more (the published cap)' };
  else p.gen = mw == null ? null : mw * 1000;
  return p;
}
function readNgFeeder(a) {
  return part({ id: str(a.feeder_cdf || a.Master_CDF, 40), sub: str(a.substation_name, 60), kv: kvOf(a.feeder_voltage),
    genQueue: toKw(a.feeder_queued_dg, 'MW'), refreshed: dateOf(a.hca_refresh_date) });
}

/* Rhode Island Energy (PPL): HC is the section figure in MW on layer 0;
   layer 4 (single and two phase) publishes the feeder but no section HC. */
function readRi(a) {
  var p = part({ id: str(a.Network_ID, 40), sub: str([a.Substation, a.Substation_Bank ? '(' + a.Substation_Bank + ')' : ''].filter(Boolean).join(' '), 80),
    kv: kvOf(a.Voltage), gen: toKw(a.HC, 'MW'), genQueue: toKw(a.DG_In_Queue, 'MW'), refreshed: dateOf(a.Map_Refresh_Date) });
  if (a.HC === undefined) p.flags.push('single or two phase: no section figure published');
  if (String(a.Challenging_Feeder || '') === 'Y') p.flags.push('a challenging feeder: the zero is real');
  p.upstream.bankKw = toKw(a.Substation_Bank_Anti_Islanding_, 'MW');
  return p;
}

/* Eversource's navigator (envelio): one parcel's nearest medium-voltage
   section, per season, for generation and for load; kW. The door reads all
   four seasons and the smallest of each is the published figure. */
function readEnvelio(sidebars) {
  var gen = null, load = null, base = null, genSub = null, loadSub = null, dist = null, onePhase = false;
  (sidebars || []).forEach(function (s) {
    var d = s && s.data ? s.data : s;
    if (!d || typeof d !== 'object') return;
    var hc = num(d.hosting_capacity), cv = d.customer_values || {};
    if (!base) base = d;
    /* a single-phase section reads exactly 50 kW for generation: the same
       placeholder the legacy map writes as 0.05 MW ("not studied") */
    if (s.behavior === 'gen' && hc != null && /^1/.test(String(d.phase || '')) && hc === 50) { onePhase = true; hc = null; }
    if (s.behavior === 'gen' && hc != null) { gen = gen == null ? hc : Math.min(gen, hc); var g = num(cv.primary_station_hc_in_kw); if (g != null) genSub = genSub == null ? g : Math.min(genSub, g); }
    if (s.behavior === 'load' && hc != null) { load = load == null ? hc : Math.min(load, hc); var l = num(cv.primary_station_hc_in_kw); if (l != null) loadSub = loadSub == null ? l : Math.min(loadSub, l); }
    var dm = num(d.distance_in_meters); if (dm != null) dist = dist == null ? dm : Math.min(dist, dm);
  });
  if (!base) return null;
  var cv0 = base.customer_values || {};
  var p = part({ id: str(cv0.feeder_name, 40), sub: str(cv0.primary_station_name, 60), kv: num(base.line_voltage_in_kv), phase: str(base.phase, 4),
    gen: gen, load: load, genQueue: num(cv0.generators_in_queue_in_kw), refreshed: dateOf(cv0.date_last_updated) });
  p.upstream.substationKw = genSub != null && loadSub != null ? Math.min(genSub, loadSub) : (genSub != null ? genSub : loadSub);
  p.distanceM = dist;
  if (cv0.feeds_secondary_network_customer === true) p.flags.push('feeds secondary-network customers');
  if (onePhase && gen == null) p.flags.push('single-phase section: generation not studied');
  return p;
}

/* ── entries ─────────────────────────────────────────────────────────── */
var ALL = ['storage', 'export', 'load'], GEN = ['storage', 'export'], LOAD = ['storage', 'load'];
function L(url, ids, outFields, read, opts) {
  var o = { url: url, ids: ids, outFields: outFields, read: read, for: ALL };
  var k; for (k in (opts || {})) if (opts.hasOwnProperty(k)) o[k] = opts[k];
  return o;
}
function none(key, display, eiaIds, states, type, viewerUrl, note, extra) {
  var e = { key: key, display: display, eiaIds: eiaIds, states: states, type: type, status: 'none', verifiedAt: VERIFIED_AT,
    terms: 'n/a', publishes: { gen: false, load: false, storage: false }, viewerUrl: viewerUrl || null,
    viewerLabel: viewerUrl ? display + "'s interconnection page" : null, note: note };
  var k; for (k in (extra || {})) if (extra.hasOwnProperty(k)) e[k] = extra[k];
  return e;
}

var COMED_FIELDS = ['Feeder', 'Feeder_N', 'SS_N', 'BESS_HC', 'PV_HC_kW', 'EV_HC_kW', 'Feeder_Q', 'Queue_RD'];
var AMEREN = 'https://services5.arcgis.com/3jEEGnl6c1x9Sze7/arcgis/rest/services/';
var PSEG = 'https://services.arcgis.com/yHb9HdkiNl1PZaOr/arcgis/rest/services/';
var FIRSTENERGY = 'https://services9.arcgis.com/QhIvHlqYDjdoPWZG/arcgis/rest/services/';
var PHI = 'https://services3.arcgis.com/agWTKEK7X5K1Bx7o/arcgis/rest/services/';
var ORU = 'https://services.arcgis.com/ciPnsNFi1JLWVjva/arcgis/rest/services/';
var PGE = 'https://services2.arcgis.com/mJaJSax0KPHoCNB6/arcgis/rest/services/DRPComplianceRelProd/FeatureServer';
var UI = 'https://services1.arcgis.com/KUQsV0ju95o9UMmS/arcgis/rest/services/';
var EVS = 'https://dghostingexternalmapprod.eversource.com/dghosting/rest/services/';
var NGRID = 'https://systemdataportal.nationalgrid.com/arcgis/rest/services/MASDP/';
var RIE = 'https://services.arcgis.com/NTSXKyJwdnK9ffCb/arcgis/rest/services/RI_Hosting_Capacity_2025/FeatureServer';
var ACE_GEN_FIELDS = ['FeederID', 'Substation', 'Voltage', 'Allowable_PV_kW', 'Transformer_Large_Gen_HC', 'Total_Pending_Gen_kW', 'Last_Updated'];
/* `required`: a join layer whose failure fails the reading. A restriction
   can only LOWER the figure, so a reading without it would say "Fits" where
   ACE allows 50 kW; better unreachable than that. */
var ACE_CAP = L(PHI + 'PHI_Restrictions_Public/FeatureServer', [0, 1], ['FEEDERID', 'Restriction_kW', 'Restriction_Category'], readAceCap, { for: GEN, join: true, required: true });
var ACE_LOAD = L(PHI + 'PHI_EV_Load_Serving_Capacity/FeatureServer', [0], ['FEEDERID', 'Substation', 'Capacity_MW'], readAceLoad, { for: LOAD });
var UI_FIELDS = ['Circuit', 'Substation', 'Operating_Voltage', 'Phase', 'Calc_Location_HC', 'Remaining_Load_Capacity', 'Remaining_Capacity__MW_', 'Transmission_PNode_ID'];
var EVS_CT_GEN = ['CIRCUITID', 'BULK_SUB_NAME', 'SECTION_OPERATING_VOLTAGE', 'HOSTING_CAPACITY_MW', 'BULK_SUB_HC_MW', 'IN_QUEUE_DG_KW', 'DATE_UPDATED'];
var SCE = 'https://';
var SCE_FIELDS = ['circuit_name', 'substation_name', 'substation_voltage', 'circuit_voltage', 'uniform_generation', 'uniform_generation_op_flex', 'ica_overall_load', 'changed_date'];
var SCE_FIELDS_1PH = SCE_FIELDS.slice(0, 7);   /* the non-three-phase layer has no changed_date */

var ENTRIES = [
  /* ═══ ILLINOIS ═══ */
  { key: 'comed', display: 'ComEd', legal: 'Commonwealth Edison Company', eiaIds: ['4110'], holding: 'Exelon', states: ['IL'], type: 'IOU',
    status: 'verified', verifiedAt: VERIFIED_AT, terms: 'review',
    termsNote: "ComEd's gateway answers only with its own viewer's Referer, which the server sets (comed-service.js). Single lookups a person asks for, with attribution and ComEd's map linked; get ComEd's or counsel's sign-off before relying on it commercially.",
    test: [42.0334, -88.0834], bbox: [40.6, -89.5, 42.6, -87.4], kind: 'comed', grain: 'circuit', geometry: 'polygon', radii: [CS.NEAREST_M], resolvedWithinM: CS.NEAREST_M,
    publishes: { gen: true, load: true, storage: true }, units: 'kW', queue: 'subtract',
    layers: [L('comed-service', [CS.ATTRIB_LAYER], COMED_FIELDS, readComEd, { comed: true })],
    viewerUrl: CS.REFERER, viewerLabel: "ComEd's hosting capacity map",
    note: 'BESS_HC is min(PV_HC_kW, EV_HC_kW): net generation (discharge) and net load (charge), as ComEd\'s viewer shows them. Feeder_Q is DER in queue on the feeder, in kW, gross, and is subtracted. The polygons already carry ComEd\'s 150 ft buffer, so the radius stays 46 m; the township and section layers (71-74) hold the highest circuit in the block and are never used for a site.' },
  { key: 'ameren-il', display: 'Ameren Illinois', legal: 'Ameren Illinois Company', eiaIds: ['56697'], holding: 'Ameren', states: ['IL'], type: 'IOU',
    status: 'verified', verifiedAt: VERIFIED_AT, terms: 'review',
    termsNote: "Ameren's General Terms forbid bots and bulk extraction on an Ameren site; whether that covers its ArcGIS services is unclear. Single lookups a person asks for, attributed and linked, never a bulk harvest, pending counsel.",
    test: [39.8403, -88.9548], bbox: [36.9, -91.6, 41.6, -87.4], kind: 'arcgis', grain: 'grid-cell', geometry: 'polygon', radii: [40, 75, 150], resolvedWithinM: null,
    publishes: { gen: true, load: true, storage: false }, units: 'MW (text)', queue: 'context',
    layers: [L(AMEREN + 'IL_HC_Grids/FeatureServer', [0], ['FEEDERID', 'OPERATINGVOLTAGE', 'GENLIMITER', 'MAXGENMW_TXT'], readAmerenGen, { for: GEN }),
             L(AMEREN + 'AIC_LC_Grids/FeatureServer', [0], ['FEEDERID', 'LOADLIMITER', 'MAXLOADMW_TXT'], readAmerenLoad, { for: LOAD })],
    viewerUrl: 'https://www.ameren.com/partners/hosting-capacity-map', viewerLabel: "Ameren Illinois's capacity maps",
    note: 'Generation (discharge) and load (charge) are separate 50 m grids in MW stored as text; Ameren tells storage developers to read both, so storage is the smaller. The queue is a separate table (PublicQueue) and is not on the grid, so none is subtracted here. The distribution grid is for 5 MVA and under; 10 MVA and over is the subtransmission map.' },
  none('midamerican-il', 'MidAmerican Energy', ['12341'], ['IL'], 'IOU', 'https://www.midamericanenergy.com/customer-interconnection',
    'MidAmerican publishes no hosting capacity map (Quad Cities in Illinois). Ask its private generation team through the interconnection page.'),
  none('mtcarmel-il', 'Mt. Carmel Public Utility', ['13032'], ['IL'], 'IOU', 'https://mtcpu.com/non-residential/renewable-energy-net-metering',
    'Mt. Carmel Public Utility publishes no hosting capacity; its net-metering page lists the application and the contact.'),
  none('cwlp-il', 'City Water, Light & Power (Springfield)', ['17828'], ['IL'], 'muni', 'https://www.cwlp.com/Renewable.aspx',
    'CWLP publishes no hosting capacity; interconnection is by application to CWLP.'),
  { key: 'naperville-il', display: 'Naperville Electric', eiaIds: ['13208'], states: ['IL'], type: 'muni', status: 'candidate', verifiedAt: VERIFIED_AT, terms: 'unknown',
    publishes: { gen: true, load: false, storage: false },
    viewerUrl: 'https://www.naperville.il.us/services/electric-utility/powering-our-community-for-the-future/solar-panel-guidelines/', viewerLabel: "Naperville Electric's solar guidelines",
    note: 'The city hosts a service-point layer (HC_CAP_AVAILABLE) whose units are not stated, and a consultant\'s unofficial study layer is also public and must not be used. Neither is wired; ask Naperville Electric.' },
  none('rock-energy', 'Rock Energy Cooperative', ['16196'], ['IL', 'WI'], 'coop', null,
    'Rock Energy Cooperative (a Wisconsin co-op that reaches Boone and Winnebago counties) publishes no hosting capacity.'),
  none('il-munis', 'Illinois municipal utilities', ['16179', '17860', '1325', '7096', '20824'], ['IL'], 'group', null,
    'Illinois municipal utilities publish no hosting capacity; contact the city\'s electric department.', { group: { states: ['IL'], types: ['MUNICIPAL', 'POLITICAL SUBDIVISION', 'STATE'] } }),
  none('il-coops', 'Illinois electric cooperatives', ['4362', '17585', '17697', '9750', '13292', '18955', '5535', '20222', '5585', '12395', '17040', '3931', '97', '3806', '9209', '8824', '12070', '12803', '16420', '17631', '17838', '29296', '3726', '5531'], ['IL'], 'group', 'https://aiec.coop/our-members/',
    'No Illinois cooperative publishes hosting capacity; ask the co-op directly.', { group: { states: ['IL'], types: ['COOPERATIVE'] } }),

  /* ═══ FLORIDA: nothing is published anywhere in the state ═══ */
  none('fpl', 'Florida Power & Light', ['6452', '7801'], ['FL'], 'IOU', 'https://www.fpl.com/clean-energy/net-metering/guidelines.html',
    'FPL (including former Gulf Power in Northwest Florida) publishes no hosting capacity. Its Tier 3 agreement screens aggregate generation on a radial circuit at 15% of the line section\'s annual peak load, and a 10% fault-current contribution; FPL computes those, not OMEGA. Ask through FPL\'s interconnection process.'),
  none('duke-fl', 'Duke Energy Florida', ['6455'], ['FL'], 'IOU', 'https://www.duke-energy.com/business/products/renewables/generate-your-own/state-jurisdictional-projects',
    'Duke Energy Florida publishes no hosting capacity (its public maps cover the Carolinas and Ohio only). It sells a $1,000 non-refundable, non-binding Pre-Application Report for a location.'),
  none('teco', 'Tampa Electric', ['18454'], ['FL'], 'IOU', 'https://www.tampaelectric.com/solarsolutions/solarprograms/connectingyoursolar/',
    'Tampa Electric publishes no hosting capacity; interconnection is by tiered application.'),
  none('fpu', 'Florida Public Utilities', ['6457'], ['FL'], 'IOU', 'https://www.fpuc.com/', 'Florida Public Utilities publishes no hosting capacity.'),
  none('jea', 'JEA', ['9617'], ['FL'], 'muni', 'https://www.jea.com/Environment/Distributed_Generation_Policy/', 'JEA publishes no hosting capacity; its distributed generation policy is the route.'),
  none('ouc', 'Orlando Utilities Commission', ['14610'], ['FL'], 'muni', null, 'OUC publishes its service area but no hosting capacity.'),
  none('lakeland', 'Lakeland Electric', ['10623'], ['FL'], 'muni', 'https://lakelandelectric.com/programs-and-services/solar', 'Lakeland Electric publishes no hosting capacity.'),
  none('gru', 'Gainesville Regional Utilities', ['6909'], ['FL'], 'muni', null, 'GRU publishes no hosting capacity; the owner pays for any system impact study.'),
  none('tallahassee', 'City of Tallahassee Utilities', ['18445'], ['FL'], 'muni', null,
    'Tallahassee publishes its feeders and substations but no capacity figure; ask the city\'s electric utility.'),
  none('fl-munis', 'Florida municipal utilities', ['10376', '13955', '9616', '8795', '10226', '13485', '6616', '10868', '10620', '58124', '1300', '15776'], ['FL'], 'group', null,
    'No Florida municipal utility publishes hosting capacity; contact its net-metering or interconnection office.', { group: { states: ['FL'], types: ['MUNICIPAL', 'POLITICAL SUBDIVISION', 'STATE'] } }),
  none('fl-coops', 'Florida electric cooperatives', ['10857', '20885', '18304', '3757', '14606', '18449', '3502', '6443', '20371', '7785', '5964'], ['FL'], 'group', null,
    'No Florida cooperative publishes hosting capacity; ask the co-op.', { group: { states: ['FL'], types: ['COOPERATIVE'] } }),

  /* ═══ GEORGIA ═══ */
  { key: 'georgia-power', display: 'Georgia Power', eiaIds: ['7140'], holding: 'Southern Company', states: ['GA'], type: 'IOU', status: 'account', verifiedAt: VERIFIED_AT,
    terms: 'nda', termsNote: 'Registered users only: an annual licence, an NDA and MFA, and results that "must not be disclosed". OMEGA never reads, caches or redistributes it.',
    publishes: { gen: true, load: false, storage: false },
    viewerUrl: 'https://www.georgiapower.com/business/products-programs/business-solutions/commercial-solar-solutions/distributed-generation/hosting-capacity-tool.html',
    viewerLabel: "Georgia Power's Hosting Capacity Tool (registration)",
    note: 'Georgia Power publishes distribution hosting capacity (kW, 12-25 kV feeders, 250 kW-6 MW) only to registered users under an NDA. For large loads and transmission it points to Southern Company\'s public SIGHT heat map (sight.southernco.com).' },
  none('ga-emcs', 'Georgia EMCs', ['9601', '3916', '16865', '7090', '20065', '17832', '13716', '6411', '4432'], ['GA'], 'group', null,
    'No Georgia EMC publishes hosting capacity; ask the EMC, and Georgia Transmission or Oglethorpe for large projects. A new premises of 900 kW or more may choose its supplier once under the Territorial Act.', { group: { states: ['GA'], types: ['COOPERATIVE'] } }),
  none('ga-munis', 'Georgia municipal utilities', ['11646', '4744', '3408'], ['GA'], 'group', 'https://www.meagpower.org/',
    'No MEAG Power city, Dalton Utilities or EPB publishes hosting capacity; contact the city utility.', { group: { states: ['GA'], types: ['MUNICIPAL', 'POLITICAL SUBDIVISION', 'STATE'] } }),

  /* ═══ NEW JERSEY ═══ */
  { key: 'pseg', display: 'PSE&G', legal: 'Public Service Electric & Gas Co.', eiaIds: ['15477'], holding: 'PSEG', states: ['NJ'], type: 'IOU',
    status: 'verified', verifiedAt: VERIFIED_AT, terms: 'public', termsNote: 'Informational only per PSE&G; attributed and linked.',
    test: [40.7357, -74.1724], bbox: [39.6, -75.6, 41.1, -73.9], kind: 'arcgis', grain: 'service-point', geometry: 'point', radii: [30, 75, 150], resolvedWithinM: 75,
    publishes: { gen: true, load: true, storage: false }, units: 'kW (generation); MW (EV load)', queue: 'netted',
    layers: [L(PSEG + 'NM_HCM_ServicePoints/FeatureServer', [0, 1], ['BASE_CIRCUITID', 'VVT_VOLTAGE', 'circuittype', 'circuitavailability', 'stationavailability', 'TotalAvailabilitySymbol', 'PendingSolar', 'stationname'], readPsegGen, { for: GEN }),
             L(PSEG + 'EVCapacity/FeatureServer', [0], ['EV_CID', 'CAPACITY_REMAINING'], readPsegLoad, { for: LOAD })],
    viewerUrl: 'https://experience.arcgis.com/experience/c28232df7cad40dfb9cf049c9cb97237/', viewerLabel: "PSE&G's hosting capacity portal",
    note: 'PSE&G\'s availability is a fixed-ceiling saturation screen (1,200 kW at 4 kV, 5,000 kW at 13 kV, less installed and pending solar), so the queue is already in it; 26 kV circuits carry no figure. EV load capacity is in MW (rating less peak).' },
  { key: 'jcpl', display: 'JCP&L', legal: 'Jersey Central Power & Light', eiaIds: ['9726'], holding: 'FirstEnergy', states: ['NJ'], type: 'IOU',
    status: 'verified', verifiedAt: VERIFIED_AT, terms: 'public', termsNote: 'Licence reads "for informational purposes only"; attributed and linked.',
    test: [40.7968, -74.4815], bbox: [39.7, -75.2, 41.4, -73.9], kind: 'arcgis', grain: 'transformer', geometry: 'point', radii: [100, 300], resolvedWithinM: null,
    publishes: { gen: true, load: true, storage: false }, units: 'kW AC', queue: 'context',
    layers: [L(FIRSTENERGY + 'Solar_Accommodation_Limit_2020/FeatureServer', [0], ['RemainNum', 'Remaining'], readJcplGen, { for: GEN }),
             L(FIRSTENERGY + 'HostingCapacityEV/FeatureServer', [0], ['remainnum', 'remaining'], readJcplLoad, { for: LOAD })],
    viewerUrl: 'https://www.firstenergycorp.com/feconnect/newjersey/solar-accommodation-map.html', viewerLabel: "JCP&L's solar accommodation map",
    note: 'One value per transformer point, with no circuit, substation, voltage or queue published. Under 100 kW is a display bucket ("Less than 100 kW AC") and is judged at its low end.' },
  { key: 'ace', display: 'Atlantic City Electric', legal: 'Atlantic City Electric Co', eiaIds: ['963'], holding: 'Exelon', states: ['NJ'], type: 'IOU',
    status: 'verified', verifiedAt: VERIFIED_AT, terms: 'public', termsNote: 'Values not guaranteed per ACE; attributed and linked.',
    test: [39.7029, -75.1118], bbox: [38.9, -75.6, 40.1, -74.0], kind: 'arcgis', grain: 'line-section', geometry: 'line', radii: [60, 150, 400], resolvedWithinM: 60,
    publishes: { gen: true, load: true, storage: false }, units: 'kW (generation); MW (EV load)', queue: 'subtract',
    layers: [L(PHI + 'PHI_Hosting_Capacity10_2_2026/FeatureServer', [4, 5], ACE_GEN_FIELDS, readAceGen,
               { for: GEN, resolve: { webmap: '5a5650aece5f462f9266ac792e4380fb', match: '/PHI_Hosting_Capacity\\d{1,2}_\\d{1,2}_\\d{4}/FeatureServer' } }),
             ACE_CAP, ACE_LOAD],
    /* the restriction and EV services are their own, not renamed with the dated one: the fallback reads them too */
    fallback: { label: 'the June 2026 publication', stale: true, layers: [L(PHI + 'PHI_Hosting_Capacity_Public/FeatureServer', [4, 5], ACE_GEN_FIELDS, readAceGen, { for: GEN }), ACE_CAP, ACE_LOAD] },
    viewerUrl: 'https://www.atlanticcityelectric.com/smart-energy/my-green-power-connection/developers-contractors/technical-consideration/hosting-capacity-map',
    viewerLabel: "Atlantic City Electric's hosting capacity map",
    note: 'Allowable_PV_kW never applies the substation transformer limit, so the smaller of it and Transformer_Large_Gen_HC is read. Whether the figure is net of pending generation is not stated, so pending generation is subtracted from it; a feeder restriction then caps what is left (a per-project ceiling on new DER, never room the queue is counted against). The service name carries its publication date; it is resolved from ACE\'s web map when it moves.' },
  { key: 'reco', display: 'Rockland Electric', legal: 'Rockland Electric Company', eiaIds: ['16213'], holding: 'Con Edison', states: ['NJ'], type: 'IOU',
    status: 'verified', verifiedAt: VERIFIED_AT, terms: 'public', termsNote: 'O&R publishes an official REST services page for these layers.',
    test: [41.0468, -74.0229], bbox: [40.9, -74.8, 41.4, -73.9], kind: 'arcgis', grain: 'line-section', geometry: 'line', radii: [60, 150, 400], resolvedWithinM: 60,
    publishes: { gen: true, load: true, storage: true }, units: 'MW', queue: 'context',
    layers: [L(ORU + 'ORU_NodalHCV_Prod/FeatureServer', [0], ['CIRCUIT', 'SUBSTATION', 'LOCAL_VOLTAGE', 'PV_SECTION', 'QUEUED_DER', 'HC_REFESH_DATE'], readRecoGen, { where: "REGION='RECO'" }),
             L(ORU + 'ORU_EV_Storage_Prod/FeatureServer', [0], ['CIRCUIT', 'SC_SECTION', 'STORAGE_UPDATEDATE'], readRecoCharge, { for: ['storage'], join: true }),
             L(ORU + 'ORU_EV_Storage_Prod/FeatureServer', [1], ['CIRCUIT', 'SD_SECTION'], readRecoDischarge, { for: ['storage'], join: true }),
             L(ORU + 'ORU_EVM_Feeders_Prod/FeatureServer', [0], ['CIRCUIT', 'EV_HEADROOM'], readRecoLoad, { for: ['load'], join: true })],
    viewerUrl: 'https://www.oru.com/en/business-partners/hosting-capacity', viewerLabel: "Orange & Rockland's hosting capacity maps",
    note: 'Section figures in MW; storage charge and discharge are published separately and the smaller is read. QUEUED_DER is the FEEDER\'s DG in queue beside a SECTION figure, so it is shown beside the figure, not subtracted from it. The storage and EV layers carry New York rows too, so only circuits on the New Jersey (REGION RECO) layer are kept.' },
  none('vineland', 'Vineland Municipal Electric Utility', ['19856'], ['NJ'], 'muni', 'https://utilities.vinelandcity.org/net-metering/',
    'Vineland publishes no hosting capacity and says areas of high renewable injection keep it from supporting new generation above 5 kW AC, if at all.'),
  none('nj-munis', 'New Jersey municipal utilities', ['2650', '11476', '17571', '14472', '16864', '12608', '10776', '14648'], ['NJ'], 'group', null,
    'No New Jersey municipal utility publishes hosting capacity; contact the borough\'s electric department. A neighbouring utility\'s figures do not apply.', { group: { states: ['NJ'], types: ['MUNICIPAL', 'POLITICAL SUBDIVISION', 'STATE'] } }),
  /* a specific co-op, matched by its EIA id only: no `group`, so another
     co-op (Delaware Electric Cooperative inside New Jersey's rough box) is
     never named Sussex REC */
  none('sussex-rec', 'Sussex Rural Electric Cooperative', ['40299'], ['NJ'], 'coop', 'https://www.sussexrec.com/interconnection',
    'Sussex REC publishes no hosting capacity; a system over 100 kW may need an independent engineering assessment. It is supplied by JCP&L\'s 34.5 kV ties.'),

  /* ═══ ARIZONA: nothing is published anywhere in the state (checked
     utility by utility on 2026-10-20; docs/HOSTING-ARIZONA.md). The ACC's
     interconnection rules (A.A.C. R14-2-2601 ff., in force 2020-02-25)
     give the regulated utilities a screen instead of a map: Screen A
     (R14-2-2615) caps a circuit at 15% of its annual peak or its "circuit
     hosting capacity limit", whichever is greater, and a Pre-Application
     Report (R14-2-2616) returns, within 21 calendar days and from data the
     utility already has, the total, allocated, queued and available
     capacity in MW of the substation bus or bank and the circuit likely to
     serve the site. SRP, the cities, the districts and the tribal utilities
     are not under those rules. ═══ */
  none('aps', 'Arizona Public Service', ['803'], ['AZ'], 'IOU', 'https://www.aps.com/dg',
    'APS publishes no hosting capacity map or data; its engineers compute a circuit\'s hosting capacity inside their own review (Screen A). Ask APS for a Pre-Application Report under A.A.C. R14-2-2616 (its form goes to renewables@aps.com): the circuit and the substation bus or bank capacity, total, allocated, queued and available, in MW, within 21 calendar days.',
    { legal: 'Arizona Public Service Company', holding: 'Pinnacle West', verifiedAt: AZ_VERIFIED_AT,
      route: 'a Pre-Application Report under A.A.C. R14-2-2616 (renewables@aps.com): the circuit and substation capacity in MW within 21 days',
      check: { url: 'https://apsc.maps.arcgis.com/apps/View/index.html?appid=edc55ca7fa254b528433ef1fe66d72af', label: 'APS\'s Service Areas Viewer' },
      terms: 'display-only', termsNote: 'APS\'s CC&N service-territory layer is licensed for use inside ArcGIS Online only, so OMEGA never queries it; a person is sent to APS\'s own Service Areas Viewer to confirm the point. Its public DG_Locations layer carries meters and addresses and is never a source.' }),
  none('srp', 'Salt River Project', ['16572'], ['AZ'], 'public', 'https://www.srpnet.com/doing-business/builders-developers-contractors/info-commercial-solar-contractors',
    'SRP publishes no distribution hosting capacity. Its Distributed Generation Interconnection Handbook (revised 2026-04-08) screens each application against the minimum hosting capacity of the most limited section of the circuit (Screen A), computed by SRP; there is no pre-application report, and the route is SRP\'s PowerClerk application or an SRP solar representative, (602) 236-4663. The Hosting Capacity Study SRP posts on its OASIS is for transmission-level generation, not a site\'s circuit. SRP is not under the ACC\'s rules.',
    { legal: 'Salt River Project Agricultural Improvement and Power District', verifiedAt: AZ_VERIFIED_AT,
      viewerLabel: 'SRP\'s page for commercial solar installers',
      route: 'SRP\'s own review (Screen A of its DG Interconnection Handbook), through its PowerClerk application',
      check: { url: 'https://www.srpnet.com/about/service-area-territory', label: 'SRP\'s service-area lookup' },
      terms: 'no-use', termsNote: 'SRP\'s boundary layer may be used only by SRP\'s own web app (its licence: "Data may not be distributed outside SRP"), so OMEGA never queries it; a person is sent to SRP\'s own address lookup.' }),
  none('tep', 'Tucson Electric Power', ['24211'], ['AZ'], 'IOU', 'https://www.tep.com/dgir-requirements/',
    'TEP publishes no hosting capacity: it sets a circuit\'s hosting capacity on the circuit\'s minimum daytime load over the last twelve months, measured at the substation, and the DG saturation maps its FAQ mentions are not linked from its interconnection pages. Ask TEP for a Pre-Application Report under A.A.C. R14-2-2616 (renewables@tep.com): the circuit\'s capacity in MW within 21 days.',
    { legal: 'Tucson Electric Power Company', holding: 'UNS Energy (Fortis)', verifiedAt: AZ_VERIFIED_AT,
      viewerLabel: 'TEP\'s interconnection requirements',
      route: 'a Pre-Application Report under A.A.C. R14-2-2616 (renewables@tep.com): the circuit\'s capacity in MW within 21 days',
      check: { url: 'https://www.tep.com/service-territory/', label: 'TEP\'s service territory map' } }),
  /* The point's utility comes from the city's OWN map (utility-territory.js
     SERVICE_AREAS): about 5.4 sq mi around and including downtown; SRP
     serves the rest of the city. */
  none('mesa', 'City of Mesa', ['12351'], ['AZ'], 'muni', 'https://www.mesaaz.gov/Utilities/Energy/Electric/Solar-Program',
    'City of Mesa publishes no hosting capacity. Its electric utility serves about 5.4 square miles around and including downtown (the city\'s own service-area map); Salt River Project serves the rest of the city. A system connects by application to Mesa Electric Utility, accepted before it is installed, then an interconnection agreement and a permission-to-operate letter; a commercial system over 50 kW goes through the city\'s Large Commercial Solar Program. Ask Mesa Energy Resources, 480-644-3683, about the circuit.',
    { legal: 'City of Mesa Electric Utility (Energy Resources)', verifiedAt: AZ_VERIFIED_AT,
      viewerLabel: 'the City of Mesa\'s solar interconnection page',
      route: 'an interconnection application to Mesa Electric Utility (Energy Resources, 480-644-3683)',
      check: { url: 'https://gis.mesaaz.gov/energy/serviceareas/Electric_Service_Area.pdf', label: 'the City of Mesa\'s electric service area map' },
      terms: 'review', termsNote: 'The electric service area is a public layer of the city\'s own Explore Mesa map service. The city\'s open-data terms allow reuse with credit to the city, but its website policy is non-commercial, and neither names this service. OMEGA asks it about one point at a time, never copies it, names the city as the source and links the city\'s own map; get counsel\'s sign-off before relying on it commercially.' }),
  none('unse', 'UNS Electric', ['19728'], ['AZ'], 'IOU', 'https://www.uesaz.com/dgir-requirements/',
    'UNS Electric publishes no hosting capacity: it sets a circuit\'s hosting capacity on minimum daytime load, and a supplemental review under R14-2-2620 costs $500 and takes up to 21 days. Ask for a Pre-Application Report under A.A.C. R14-2-2616 (renewables@uesaz.com).',
    { legal: 'UNS Electric, Inc.', holding: 'UNS Energy (Fortis)', verifiedAt: AZ_VERIFIED_AT,
      viewerLabel: 'UNS Electric\'s interconnection requirements',
      route: 'a Pre-Application Report under A.A.C. R14-2-2616 (renewables@uesaz.com)' }),
  /* The co-ops are all on the ACC's list of regulated electric utilities
     (2024-07-01), so its Pre-Application Report is theirs to answer whatever
     their own manual says; none publishes a capacity figure. */
  none('trico', 'Trico Electric Cooperative', ['19189'], ['AZ'], 'coop', 'https://trico.coop/sustainable-programs/solar/',
    'Trico Electric Cooperative publishes no hosting capacity: its Interconnection Manual (approved 2021) screens a circuit at 15% of its annual peak or the circuit hosting capacity limit, and publishes no limit. As an ACC-regulated co-op it answers a Pre-Application Report under A.A.C. R14-2-2616; its manual also offers a pre-application meeting. Apply through Trico\'s PowerClerk (sunwatts@trico.coop, 520-744-2944).',
    { legal: 'Trico Electric Cooperative, Inc.', verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Trico\'s solar interconnection page',
      route: 'a Pre-Application Report under A.A.C. R14-2-2616 (sunwatts@trico.coop, 520-744-2944)' }),
  none('ssvec', 'Sulphur Springs Valley Electric Cooperative', ['18280'], ['AZ'], 'coop', 'https://ssvec.org/sites/renewable/',
    'SSVEC publishes no hosting capacity. Its 2026 Interconnection Requirements (ACC docket E-01575A-24-0246) offer a Pre-Application Report under A.A.C. R14-2-2616 for a $125 data review fee, asked for on its DG interconnection application; the circuit hosting capacity limit in Screen A is SSVEC\'s own and is not published. SunWatts program, (520) 458-4691.',
    { legal: 'Sulphur Springs Valley Electric Cooperative, Inc.', verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'SSVEC\'s renewable interconnection page',
      route: 'a Pre-Application Report under A.A.C. R14-2-2616 ($125, asked for on its DG interconnection application)' }),
  none('navopache', 'Navopache Electric Cooperative', ['13318'], ['AZ'], 'coop', 'https://navopache.org/dg-interconnection-information-3/',
    'Navopache Electric Cooperative publishes no hosting capacity: its DG Interconnection Manual (2022) carries Screen A with no published limit and offers a pre-application meeting. As an ACC-regulated co-op it answers a Pre-Application Report under A.A.C. R14-2-2616. Energy Services, 928-368-5118.',
    { legal: 'Navopache Electric Cooperative, Inc.', verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Navopache\'s DG interconnection page',
      route: 'a Pre-Application Report under A.A.C. R14-2-2616 (Energy Services, 928-368-5118)' }),
  none('mohave', 'Mohave Electric Cooperative', ['21538'], ['AZ'], 'coop', 'https://www.mohaveelectric.com/energy-solutions/renewable-energy/sunwatts-renewable-energy-program/',
    'Mohave Electric Cooperative publishes no hosting capacity (no map, no layer and no capacity page). As an ACC-regulated co-op it answers a Pre-Application Report under A.A.C. R14-2-2616; its SunWatts program page is the way in.',
    { legal: 'Mohave Electric Cooperative, Inc.', verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Mohave Electric\'s SunWatts page',
      route: 'a Pre-Application Report under A.A.C. R14-2-2616 (through its SunWatts program)' }),
  none('graham-county', 'Graham County Electric Cooperative', ['7456'], ['AZ'], 'coop', 'https://gce.coop/energy-efficiency/solar-renewable-energy/',
    'Graham County Electric Cooperative publishes no hosting capacity (no map, no layer and no capacity page). As an ACC-regulated co-op it answers a Pre-Application Report under A.A.C. R14-2-2616; its solar page is the way in.',
    { legal: 'Graham County Electric Cooperative, Inc.', verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Graham County Electric\'s solar page',
      route: 'a Pre-Application Report under A.A.C. R14-2-2616 (through its solar program)' }),
  none('duncan-valley', 'Duncan Valley Electric Cooperative', ['5438'], ['AZ'], 'coop', 'https://dvec.org/renewable-energy-0',
    'Duncan Valley Electric Cooperative publishes no hosting capacity; its Interconnection Manual (filed with the ACC in 2021) commits to the timelines of A.A.C. R14-2-2616 to 2623, so a Pre-Application Report is the route. 928-359-2503.',
    { legal: 'Duncan Valley Electric Cooperative, Inc.', verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Duncan Valley Electric\'s renewable energy page',
      route: 'a Pre-Application Report under A.A.C. R14-2-2616 (928-359-2503)' }),
  none('columbus-az', 'Columbus Electric Cooperative', ['4071'], ['AZ'], 'coop', 'https://columbusco-op.org/net-meteringinterconnections',
    'Columbus Electric Cooperative (New Mexico, serving southeast Arizona) publishes no hosting capacity; the interconnection queue it posts each month lists the substation and feeder of each application, not capacity. In Arizona it is ACC-regulated, so a Pre-Application Report under A.A.C. R14-2-2616 is the route.',
    { legal: 'Columbus Electric Cooperative, Inc.', verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Columbus Electric\'s net metering and interconnection page',
      route: 'a Pre-Application Report under A.A.C. R14-2-2616 (through its interconnection page)' }),
  none('garkane-az', 'Garkane Energy', ['6957'], ['AZ'], 'coop', 'https://garkaneenergy.com/interconnection-application',
    'Garkane Energy publishes no hosting capacity. Its public map shows its lines, transformers and service area with no capacity on them (DOE\'s atlas lists it as an asset map), and the copy on its own website now asks for a sign-in. In Arizona the ACC governs its interconnection (its own manual says so), so a Pre-Application Report under A.A.C. R14-2-2616 is the route.',
    { legal: 'Garkane Energy Cooperative, Inc.', verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Garkane\'s interconnection application',
      route: 'a Pre-Application Report under A.A.C. R14-2-2616 (Garkane\'s interconnection application)',
      check: { url: 'https://garkane.maps.arcgis.com/apps/View/index.html?appid=60f986f187b24dfe96cb6593b2e8d3af', label: 'Garkane\'s service area map' } }),
  none('dixie-az', 'Dixie Power (Dixie Escalante REA)', ['40165'], ['AZ'], 'coop', 'https://www.dixiepower.com/services/new-construction-2/',
    'Dixie Power publishes no hosting capacity and posts no interconnection manual or DG page. In Arizona it is ACC-regulated, so a Pre-Application Report under A.A.C. R14-2-2616 is the route; ask Dixie Power, 866-673-3297.',
    { legal: 'Dixie Escalante Rural Electric Association, Inc.', verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Dixie Power\'s new construction page',
      route: 'a Pre-Application Report under A.A.C. R14-2-2616 (866-673-3297)' }),
  /* tribal utilities: not under the ACC (its own electric page says so) */
  none('ntua', 'Navajo Tribal Utility Authority', ['13314'], ['AZ'], 'tribal', 'https://www.ntua.com/assets/ntua-distributed-generation-interconnection-policy.pdf',
    'NTUA publishes no hosting capacity. Its DG Interconnection Policy (2023) covers systems under 700 kW (larger ones case by case) and studies each one itself before interconnection, without a fee for a pre-certified unit that exports no more than 15% of a radial feeder\'s load and adds no more than 25% of its short-circuit current. NTUA is not under the ACC\'s rules.',
    { legal: 'Navajo Tribal Utility Authority', verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'NTUA\'s DG Interconnection Policy',
      route: 'a pre-interconnection study by NTUA under its DG Interconnection Policy' }),
  none('gricua', 'Gila River Indian Community Utility Authority', ['65261'], ['AZ'], 'tribal', 'https://gricua.net/new-service-requirements/solar/',
    'GRICUA publishes no hosting capacity; it posts its solar applications and checklists, under and over 50 kW. It is not under the ACC\'s rules; 520-796-0600.',
    { verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'GRICUA\'s solar requirements', route: 'GRICUA\'s solar application (520-796-0600)' }),
  none('toua', 'Tohono O\'odham Utility Authority', ['14543'], ['AZ'], 'tribal', 'https://toua.net/electric/',
    'TOUA publishes no hosting capacity; its Schedule DG covers systems under 700 kW AC and cites a DG procedures manual that is not posted. It is not under the ACC\'s rules; (520) 383-2236.',
    { verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'TOUA\'s electric page', route: 'TOUA\'s own review under its Schedule DG ((520) 383-2236)' }),
  none('aha-macav', 'Aha Macav Power Service', ['58123'], ['AZ', 'CA'], 'tribal', 'https://ahamacav.com/commercial-service/',
    'Aha Macav Power Service (Fort Mojave) publishes no hosting capacity; its staff and engineers plan a commercial project with the customer. It is not under the ACC\'s rules; (928) 768-2200.',
    { verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Aha Macav\'s commercial service page', route: 'Aha Macav\'s commercial service team ((928) 768-2200)' }),
  /* public power, districts, BIA systems and two small companies. Morenci
     and Ajo are on the ACC's list; the rest are not under its rules. Every
     one of these was already a known candidate (the public group below), so
     naming it changes no territory answer; the region-sized stand-ins that
     are not known stay weak as water districts. */
  none('ed3', 'Electrical District No. 3 (Pinal County)', ['30518'], ['AZ'], 'district', 'https://www.ed3online.org/accounts-programs/distributed-generation-resources-including-solar',
    'ED3 publishes no hosting capacity. A system up to 2 MW goes through its Small Generator Interconnection Policy (Fast-Track or Study), 2 to 20 MW through its Study Process, and some need a System Engineering Analysis of ED3\'s ability to take more generation, at the customer\'s cost. ED3 is not under the ACC\'s rules; dg@ed-3.org.',
    { verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'ED3\'s distributed generation page',
      route: 'ED3\'s own review under its Small Generator Interconnection Policy (dg@ed-3.org)' }),
  none('ed2', 'Electrical District No. 2 (Pinal County)', ['15048'], ['AZ'], 'district', 'https://ed2.com/resources/solar/',
    'ED2 publishes no hosting capacity and offers no net metering; a solar application goes to solarapps@ed2.com for its review. It is not under the ACC\'s rules.',
    { verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'ED2\'s solar page', route: 'ED2\'s own review (solarapps@ed2.com)' }),
  none('ed4', 'Electrical District No. 4 (Pinal County)', ['15049'], ['AZ'], 'district', 'https://ed4.biz/connect-service/',
    'ED4 publishes no hosting capacity; its Solar Application Package is on its service page (info@ed4.com, (520) 466-7336). It is not under the ACC\'s rules.',
    { verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'ED4\'s service page', route: 'ED4\'s Solar Application Package (info@ed4.com)' }),
  none('hohokam', 'Hohokam Irrigation and Drainage District', ['8700'], ['AZ'], 'district', 'https://hohokamthepowerofchoice.com/solar-qa/',
    'Hohokam Irrigation and Drainage District sells power at retail and publishes no hosting capacity; its solar questions and answers are on its own page. It is not under the ACC\'s rules.',
    { verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Hohokam\'s solar Q&A', route: 'Hohokam\'s own review (its solar Q&A)' }),
  none('wmidd', 'Wellton-Mohawk Irrigation and Drainage District', ['25060'], ['AZ'], 'district', 'https://www.wmidd.org/solar-information.html',
    'Wellton-Mohawk Irrigation and Drainage District holds the power franchise in the Wellton-Mohawk Valley and publishes no hosting capacity. Its national territory polygon covers all of Yuma County, so in the city of Yuma Arizona Public Service is the likelier utility; confirm it with the bill. It is not under the ACC\'s rules.',
    { verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Wellton-Mohawk\'s solar information', route: 'Wellton-Mohawk\'s own review (its solar information page)' }),
  none('scip', 'San Carlos Irrigation Project (BIA)', ['19604'], ['AZ'], 'federal', 'https://www.bia.gov/scip/solar',
    'SCIP publishes no hosting capacity. Since 11 May 2026 it adds no new service, line extension or load unless no other utility can serve the site (its public notice), and caps solar at 10 kW DC. It is not under the ACC\'s rules; scipsolar@bia.gov.',
    { verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'SCIP\'s solar page', route: 'no new load unless no other utility can serve the site (its 2026 notice)' }),
  none('cra-es', 'Colorado River Agency Electrical Services (BIA)', ['3990'], ['AZ'], 'federal', 'https://www.bia.gov/services/colorado-river-agency-electrical',
    'BIA\'s Colorado River Agency Electrical Services serves homes, businesses and irrigation inside the Colorado River Indian Tribes\' reservation (Parker) and publishes no hosting capacity or DG page. Its national territory polygon is far larger than the reservation, so outside it confirm the utility with the bill. It is not under the ACC\'s rules.',
    { verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'the Colorado River Agency\'s electrical services page', route: 'the agency\'s own review (its electrical services page)' }),
  none('page-utility', 'Page Utility Enterprises', ['14373'], ['AZ'], 'muni', 'https://pageutility.com/services-rates/',
    'Page Utility Enterprises publishes no hosting capacity; its Solar Interconnection Agreement is on its services and rates page. It is not under the ACC\'s rules.',
    { verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Page Utility\'s services and rates', route: 'its Solar Interconnection Agreement' }),
  none('safford', 'City of Safford', ['16538'], ['AZ'], 'muni', 'https://www.cityofsafford.us/227/Electricity',
    'City of Safford publishes no hosting capacity; its Electric Division handles solar and net metering, (928) 432-4221. It is not under the ACC\'s rules.',
    { verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Safford\'s electric page', route: 'its Electric Division ((928) 432-4221)' }),
  none('thatcher', 'Town of Thatcher', ['18805'], ['AZ'], 'muni', 'https://www.thatcher.az.gov/residents/utilities-billing',
    'Town of Thatcher publishes no hosting capacity; its distributed generation guidelines are on its utilities page. It is not under the ACC\'s rules.',
    { verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Thatcher\'s utilities page', route: 'its distributed generation guidelines' }),
  none('wickenburg', 'Town of Wickenburg', ['20618'], ['AZ'], 'muni', 'https://wickenburgaz.gov/DocumentCenter/View/7706/Wickenburg-Grid-Solar-App-and-APS-Agmt-combined',
    'Town of Wickenburg publishes no hosting capacity, and its grid takes no generation or storage in parallel: an alternate source connects only through a break-before-make (open transition) transfer switch (its agreement, rev. 2022). A grid-tied battery or solar system cannot run on the town\'s grid. It is not under the ACC\'s rules.',
    { verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Wickenburg\'s non-parallel interconnect agreement', route: 'its non-parallel interconnect agreement only (nothing runs in parallel with the town\'s grid)' }),
  none('williams', 'City of Williams', ['56535'], ['AZ'], 'muni', 'https://www.williamsaz.gov/departments_and_services/building_department',
    'City of Williams publishes no hosting capacity; its Solar Policy is on its building department page. It is not under the ACC\'s rules.',
    { verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Williams\'s building department (Solar Policy)', route: 'its Solar Policy' }),
  none('fredonia', 'Town of Fredonia', ['6753'], ['AZ'], 'muni', 'https://www.fredoniaaz.gov/utilities',
    'Town of Fredonia publishes no hosting capacity; ask its utilities office. It is not under the ACC\'s rules.',
    { verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Fredonia\'s utilities page', route: 'its utilities office' }),
  none('morenci', 'Morenci Water & Electric', ['12919'], ['AZ'], 'IOU', 'https://www.morencitown.com/MWE',
    'Morenci Water & Electric publishes no hosting capacity and posts no solar or interconnection page. It is ACC-regulated, so a Pre-Application Report under A.A.C. R14-2-2616 is the route; MWESupport@fmi.com.',
    { legal: 'Morenci Water and Electric Company', verifiedAt: AZ_VERIFIED_AT, viewerLabel: 'Morenci Water & Electric\'s page',
      route: 'a Pre-Application Report under A.A.C. R14-2-2616 (MWESupport@fmi.com)' }),
  none('ajo', 'Ajo Improvement Company', ['176'], ['AZ'], 'IOU', null,
    'Ajo Improvement Company publishes no hosting capacity and has no website of its own. It is ACC-regulated (docket E-01025A), so a Pre-Application Report under A.A.C. R14-2-2616 is the route; ask the company.',
    { verifiedAt: AZ_VERIFIED_AT, noPage: true, route: 'a Pre-Application Report under A.A.C. R14-2-2616 (ask the company)' }),
  none('az-coops', 'Arizona electric cooperatives', [], ['AZ'], 'group', null,
    'No Arizona cooperative publishes hosting capacity (each was checked on 2026-10-20); an ACC-regulated co-op answers a Pre-Application Report under A.A.C. R14-2-2616.',
    { verifiedAt: AZ_VERIFIED_AT, group: { states: ['AZ'], types: ['COOPERATIVE'] } }),
  /* Ak-Chin (no utility website found) and Electrical District No. 8 (none
     reached) stay here by id; the region-sized water districts the national
     layer also draws (Buckeye, Tonopah, Harquahala, Ocotillo, Maricopa Water
     District, McMullen Valley) stay out on purpose, so they read as water
     districts and never as a point's utility */
  none('az-public', 'Arizona public power, districts and tribal utilities', ['25866', '5729'], ['AZ'], 'group', null,
    'No Arizona municipal, district or tribal utility publishes hosting capacity (each was checked on 2026-10-20); ask the utility. Many of these territory polygons are county-sized stand-ins, so confirm the utility with the person.',
    { verifiedAt: AZ_VERIFIED_AT, group: { states: ['AZ'], types: ['MUNICIPAL', 'POLITICAL SUBDIVISION', 'STATE', 'TRIBAL'] } }),

  /* ═══ CALIFORNIA ═══ */
  { key: 'pge', display: 'PG&E', legal: 'Pacific Gas and Electric Company', eiaIds: ['14328'], holding: 'PG&E Corporation', states: ['CA'], type: 'IOU',
    status: 'verified', verifiedAt: VERIFIED_AT, terms: 'public', termsNote: 'PG&E publishes this API for public use ("There is no log in required").',
    test: [36.795, -119.79], bbox: [34.9, -124.5, 42.1, -117.6], kind: 'arcgis', grain: 'line-section', geometry: 'line', radii: [60, 150, 400], resolvedWithinM: 60,
    publishes: { gen: true, load: true, storage: false }, units: 'kW', queue: 'context',
    layers: [L(PGE, [3], ['FeederId', 'FeederName', 'voltage_kv', 'GenCapacity_kW', 'GenCapacity_no_OpFlex_kW', 'LoadCapacity_kW', 'ICA_Analysis_Date'], readPgeLine),
             L(PGE, [2], ['FeederID', 'Substation', 'Queued_DG'], readPgeFeeder, { join: true })],
    viewerUrl: 'https://grip.pge.com/', viewerLabel: "PG&E's GRIP map",
    note: 'Integration capacity analysis per line section in kW; there is no storage figure, so storage is the smaller of generation (export, with OpFlex) and load (charging). The feeder\'s queued generation is shown beside the section figure, not subtracted from it (the CPUC analysis is refreshed with the queue; no subtraction is published).' },
  { key: 'sce', display: 'Southern California Edison', legal: 'Southern California Edison', eiaIds: ['17609'], holding: 'Edison International', states: ['CA'], type: 'IOU',
    status: 'verified', verifiedAt: VERIFIED_AT, terms: 'review', termsNote: "SCE's viewer asks users to accept its terms and sits behind bot protection; its per-circuit CSVs are CAPTCHA-gated and never automated. Have counsel review before relying on automated reads.",
    test: [34.0655, -117.6505], bbox: [32.5, -121.0, 37.9, -114.1], kind: 'arcgis', grain: 'line-section', geometry: 'line', radii: [60, 150, 400], resolvedWithinM: 60,
    publishes: { gen: true, load: true, storage: false }, units: 'MW', queue: 'context',
    layers: [L(SCE + 'drpep.sce.com/arcgis_server/rest/services/Hosted/ICA_Layer/FeatureServer', [0], SCE_FIELDS, readSce),
             L(SCE + 'drpep.sce.com/arcgis_server/rest/services/Hosted/ICA_Layer/FeatureServer', [1], SCE_FIELDS_1PH, readSce)],
    fallback: { label: 'the ArcGIS Online copy (data as of its own change date, a year older)', stale: true,
                layers: [L(SCE + 'services5.arcgis.com/z6hI6KRjKHvhNO0r/arcgis/rest/services/ICA_Layer/FeatureServer', [2], SCE_FIELDS, readSce),
                         L(SCE + 'services5.arcgis.com/z6hI6KRjKHvhNO0r/arcgis/rest/services/ICA_Layer/FeatureServer', [3], SCE_FIELDS_1PH, readSce)] },
    viewerUrl: 'https://drpep.sce.com/drpep/', viewerLabel: "SCE's DRPEP map",
    note: 'MW, mostly as strings; the OpFlex generation figure is redacted on a quarter of segments and the static-grid figure is read then. No queue is published with the section figure. SCE\'s own host is bot-protected: an HTML answer is a failure and the ArcGIS Online copy is read instead, labelled with its date.' },
  { key: 'sdge', display: 'SDG&E', legal: 'San Diego Gas & Electric', eiaIds: ['16609'], holding: 'Sempra', states: ['CA'], type: 'IOU',
    status: 'verified', verifiedAt: VERIFIED_AT, terms: 'no-replication', cache: false,
    termsNote: "SDG&E's user guide prohibits replicating its maps or redistributing downloaded data, so it is read on demand only, never cached, and always attributed and linked. Get counsel's sign-off before storing results.",
    test: [32.825, -117.155], bbox: [32.5, -117.6, 33.6, -116.0], kind: 'arcgis', grain: 'grid-cell', geometry: 'polygon', radii: [40, 75, 150], resolvedWithinM: null,
    publishes: { gen: true, load: true, storage: false }, units: 'MW', queue: 'context',
    layers: [L('https://services.arcgis.com/S0EUI1eVapjRPS5e/arcgis/rest/services/ICA_MAP_PROD_GenerationCapacityGrids_VW/FeatureServer', [0],
               ['CIRCUIT_NAME', 'SUBID', 'VOLTAGE', 'ICAWOF_UNIGENERATION', 'ICAWNOF_UNIGENERATION', 'ICAWOF_UNILOAD', 'ICAWNOF_UNILOAD'], readSdge)],
    viewerUrl: 'https://interconnectionmapsdge.extweb.sempra.com/', viewerLabel: "SDG&E's interconnection map",
    note: 'The public view draws line-segment results as small grid cells, in MW. Restricted (15/15) segments are left out of the public view, so no feature can mean redacted rather than empty.' },
  { key: 'ladwp', display: 'LADWP', legal: 'Los Angeles Department of Water and Power', eiaIds: ['11208'], states: ['CA'], type: 'muni',
    status: 'verified', verifiedAt: VERIFIED_AT, terms: 'public', termsNote: 'Public web map; attributed and linked.',
    test: [34.061, -118.309], bbox: [33.7, -118.7, 34.4, -118.1], kind: 'arcgis', grain: 'line-segment', geometry: 'line', radii: [60, 150, 400], resolvedWithinM: 60,
    publishes: { gen: false, load: true, storage: false }, units: 'kVA (ranges)', queue: 'context',
    layers: [L('https://services7.arcgis.com/ZzOj15zjzIfDG8aL/arcgis/rest/services/PowerCapacity/FeatureServer', [0], ['GISID', 'Capacity_Range_KW', 'Capacity_Status', 'Voltage_Class'], readLadwp)],
    viewerUrl: 'https://ladwp-power.maps.arcgis.com/apps/webappviewer/index.html?id=290be9aa52694ef39bf3088940079f62', viewerLabel: "LADWP's available power capacity map",
    note: 'A load (new-service) capacity map built for EV charging, published as kVA ranges by line segment; LADWP publishes no generation or storage hosting capacity.' },
  none('smud', 'SMUD', ['16534'], ['CA'], 'muni', 'https://www.smud.org/Business-Solutions-and-Rebates/Interconnection-Information', 'SMUD publishes no hosting capacity; interconnection is through its PowerClerk portal.'),
  none('iid', 'Imperial Irrigation District', ['9216'], ['CA'], 'muni', 'https://www.iid.com/', 'IID publishes no distribution hosting capacity found; confirm on iid.com.'),
  none('pacificorp-ca', 'Pacific Power (PacifiCorp)', ['14354'], ['CA'], 'IOU', null, 'PacifiCorp publishes no California hosting capacity (the CPUC ICA rule covers PG&E, SCE and SDG&E only).'),
  none('liberty-ca', 'Liberty Utilities (CalPeco)', ['57483'], ['CA'], 'IOU', 'https://libertyutilities.com/', 'Liberty publishes hosting capacity for New Hampshire only, none for California.'),
  none('bear-valley', 'Bear Valley Electric Service', [], ['CA'], 'IOU', null, 'Bear Valley Electric Service publishes no hosting capacity.', { names: ['bear valley'] }),
  none('ca-pous', 'California public utilities', [], ['CA'], 'group', null,
    'California\'s municipal utilities (Silicon Valley Power, Anaheim, Riverside, Pasadena, Burbank, Glendale, Roseville and the rest) publish no hosting capacity; ask the utility. Silicon Valley Power serves Santa Clara\'s data-centre load.', { group: { states: ['CA'], types: ['MUNICIPAL', 'POLITICAL SUBDIVISION', 'STATE'] } }),
  /* Aha Macav (Fort Mojave, 58123) has its own entry since 2026-10-20 (Arizona) */
  none('ca-coops', 'California cooperatives and tribal utilities', ['15308', '18260', '19840'], ['CA'], 'group', null,
    'California\'s co-ops and tribal utilities publish no hosting capacity; ask the utility.', { group: { states: ['CA'], types: ['COOPERATIVE', 'TRIBAL'] } }),

  /* ═══ CONNECTICUT ═══ */
  { key: 'eversource-ct', display: 'Eversource (Connecticut)', legal: 'Connecticut Light & Power', eiaIds: ['4176'], holding: 'Eversource', states: ['CT'], type: 'IOU',
    status: 'verified', verifiedAt: VERIFIED_AT, terms: 'review',
    termsNote: "The navigator's JSON is anonymous but undocumented and vendor-run (envelio); it is read server-side, a person's lookup at a time, and cached. No automated-use terms were found; Eversource's site terms apply.",
    test: [41.3948, -73.4540], bbox: [40.9, -73.8, 42.1, -71.7], kind: 'envelio', envelio: { host: 'navigator.eversource-ct.envelio.com' },
    grain: 'parcel', geometry: 'parcel', radii: [0, 25], resolvedWithinM: 75,
    publishes: { gen: true, load: true, storage: false }, units: 'kW', queue: 'context',
    fallbackOn: ['error', 'empty'],
    fallback: { label: 'the legacy circuit map (data as of November 2025)', stale: true, kind: 'arcgis', grain: 'line-section', geometry: 'line', radii: [60, 150, 400], resolvedWithinM: 60,
      layers: [L(EVS + 'DG_Hosting_Final/DG_Hosting_CT_Final/MapServer', [0], EVS_CT_GEN, readEversourceLegacyGen, { for: GEN }),
               L(EVS + 'EV_Hosting/EV_HC_Capacity_CT/MapServer', [0], ['CIRCUIT_NAME', 'SBSTA_NM', 'VOLTAGE', 'FEEDER_CAPACITY_TO_MAP_MW'], readEversourceLegacyLoad, { for: LOAD })] },
    viewerUrl: 'https://navigator.eversource-ct.envelio.com/', viewerLabel: "Eversource's Interconnection Navigator",
    note: 'Parcel-based generation hosting capacity and load headroom in kW by season; the smallest of the four seasons is read and storage is the smaller of the two. The feeder\'s queue is shown beside the parcel figure, not subtracted from it. Where the navigator has no parcel the legacy circuit map is read (section MW; 0.05 is a single-phase placeholder, not 50 kW).' },
  { key: 'ui', display: 'United Illuminating', legal: 'The United Illuminating Company', eiaIds: ['19497'], holding: 'Avangrid', states: ['CT'], type: 'IOU',
    status: 'verified', verifiedAt: VERIFIED_AT, terms: 'public', termsNote: 'Informational estimates per UI; attributed and linked.',
    test: [41.2307, -73.064], bbox: [41.0, -73.4, 41.5, -72.7], kind: 'arcgis', grain: 'line-section', geometry: 'line', radii: [60, 150, 400], resolvedWithinM: 60,
    publishes: { gen: true, load: true, storage: true }, units: 'kW (location); MW (circuit, substation)', queue: 'context',
    layers: [L(UI + 'UI_BESS_HC_CHARGING/FeatureServer', [0, 1], UI_FIELDS.concat(['Queued_Capacity__MW_']), readUiCharge, { for: ['storage'] }),
             L(UI + 'UI_BESS_HC_DISCHARGING/FeatureServer', [0, 1], UI_FIELDS.concat(['DER_in_Queue__MW_']), readUiDischarge, { for: ['storage'] }),
             L(UI + 'UI_DG_HC/FeatureServer', [0, 1], UI_FIELDS.concat(['DER_in_Queue__MW_']), readUiGen, { for: ['export'] }),
             L(UI + 'UI_EV_HC/FeatureServer', [0, 1], UI_FIELDS.concat(['Queued_Capacity__MW_']), readUiLoad, { for: ['load'] })],
    viewerUrl: 'https://uil.maps.arcgis.com/apps/instant/portfolio/index.html?appid=5f27da869c6d43a5811b20bf80ac4f77', viewerLabel: "UI's hosting capacity maps",
    note: 'UI publishes storage charging and discharging separately; the location figure (kW) already takes the circuit and substation limits, and the smaller of charge and discharge is read. Both the three-phase and the single-phase layer are read (the discharging service swaps their ids). Downtown New Haven is unmapped, which reads as no circuit here, not zero.' },
  none('ct-munis', 'Connecticut municipal utilities', ['13831', '7716', '20038', '13825', '17569', '2089', '9734'], ['CT'], 'group', null,
    'Connecticut\'s municipal utilities (Norwich, Groton and Bozrah, Wallingford, South Norwalk, Norwalk Third Taxing District, Jewett City) publish no hosting capacity; ask the utility. In Norwalk confirm SNEW, the Third Taxing District or Eversource with the bill.', { group: { states: ['CT'], types: ['MUNICIPAL', 'POLITICAL SUBDIVISION', 'NOT AVAILABLE'] } }),

  /* ═══ MASSACHUSETTS ═══ */
  { key: 'eversource-ma', display: 'Eversource (Massachusetts)', legal: 'NSTAR Electric', eiaIds: ['54913'], holding: 'Eversource', states: ['MA'], type: 'IOU',
    status: 'verified', verifiedAt: VERIFIED_AT, terms: 'review',
    termsNote: "The navigator's JSON is anonymous but undocumented and vendor-run (envelio); read server-side, a person's lookup at a time, and cached.",
    test: [42.4501, -73.2454], bbox: [41.2, -73.6, 42.9, -69.9], kind: 'envelio', envelio: { host: 'navigator.eversource.envelio.com' },
    grain: 'parcel', geometry: 'parcel', radii: [0, 25], resolvedWithinM: 75,
    publishes: { gen: true, load: true, storage: false }, units: 'kW', queue: 'context',
    fallbackOn: ['error', 'empty'],
    fallback: { label: 'the legacy circuit map', stale: true, kind: 'arcgis', grain: 'line-section', geometry: 'line', radii: [60, 150, 400], resolvedWithinM: 60,
      layers: [L(EVS + 'DG_Hosting_Final/DG_Hosting_EMA_Final/MapServer', [0], ['NSTAR_CIRCUITID', 'SECTION_OPERATING_VOLTAGE', 'BULK_SUB_NAME', 'HOSTING_CAPACITY_MW', 'BULK_SUB_HC_MW', 'IN_QUEUE_DG_KW'], readEversourceLegacyGen, { for: GEN }),
               L(EVS + 'DG_Hosting_Final/DG_Hosting_WMA_Final/MapServer', [0], ['CIRCUIT_NAME', 'SECTION_OPERATING_VOLTAGE', 'BULK_SUB_NAME', 'HOSTING_CAPACITY_MW', 'BULK_SUB_HC_MW', 'IN_QUEUE_DG_KW'], readEversourceLegacyGen, { for: GEN })] },
    viewerUrl: 'https://navigator.eversource.envelio.com/', viewerLabel: "Eversource's Grid Connection Navigator",
    note: 'Parcel-based, in kW, by season; the smallest season is read. Downtown Boston\'s secondary network is not on the map. The legacy circuit map answers nothing if its date field is asked for, so it is never asked.' },
  { key: 'ngrid-ma', display: 'National Grid (Massachusetts)', legal: 'Massachusetts Electric Company', eiaIds: ['11804', '13206'], holding: 'National Grid', states: ['MA'], type: 'IOU',
    status: 'verified', verifiedAt: VERIFIED_AT, terms: 'public', termsNote: 'Public system data portal; not a guarantee of interconnection.',
    test: [42.7762, -71.0773], bbox: [41.2, -73.1, 42.9, -69.9], kind: 'arcgis', grain: 'line-section', geometry: 'line', radii: [60, 150, 500], resolvedWithinM: 60,
    publishes: { gen: true, load: false, storage: false }, units: 'MW', queue: 'context',
    layers: [L(NGRID + 'Nodal_Hosting_Capacity_MA/MapServer', [2], ['feeder_cdf', 'primary_voltage', 'primary_hc', 'distance_to_substation'], readNgPrimary, { for: GEN }),
             L(NGRID + 'Nodal_Hosting_Capacity_MA/MapServer', [0], ['feeder_cdf', 'Master_CDF', 'substation_name', 'feeder_voltage', 'feeder_queued_dg', 'hca_refresh_date'], readNgFeeder, { for: GEN, join: true })],
    viewerUrl: 'https://systemdataportal.nationalgrid.com/MA/', viewerLabel: "National Grid's Massachusetts system data portal",
    note: 'Generation hosting capacity on the nearest primary segment, in MW (the feeder maximum is the best spot and is capped at 10 MW, so it is never the site figure). No load or storage figure is published; the feeder\'s queued DG is shown beside the section figure, not subtracted from it.' },
  { key: 'unitil-ma', display: 'Unitil (Fitchburg Gas & Electric)', eiaIds: ['6374'], states: ['MA'], type: 'IOU', status: 'account', verifiedAt: VERIFIED_AT,
    terms: 'login', termsNote: 'The map sits behind Microsoft sign-in (an Azure application proxy); OMEGA cannot and does not read it.',
    publishes: { gen: true, load: true, storage: false },
    viewerUrl: 'https://unitil.com/ways-to-save/solar-private-generation/ma-interconnection-hosting-capacity-map', viewerLabel: "Unitil's hosting capacity map page",
    note: 'Unitil publishes a feeder thermal hosting capacity map (MVA bins, measured near the substation) behind a sign-in; call Unitil at 1-888-301-7700.' },
  none('ma-mlps', 'Massachusetts municipal light plants', ['4147'], ['MA'], 'group', null,
    'Massachusetts\' municipal light plants publish no hosting capacity; ask the light plant\'s interconnection contact.', { group: { states: ['MA'], types: ['MUNICIPAL', 'POLITICAL SUBDIVISION', 'STATE'] } }),

  /* ═══ RHODE ISLAND ═══ */
  { key: 'ri-energy', display: 'Rhode Island Energy', legal: 'The Narragansett Electric Co.', eiaIds: ['13214'], holding: 'PPL', states: ['RI'], type: 'IOU',
    status: 'verified', verifiedAt: VERIFIED_AT, terms: 'public', termsNote: 'Public system data portal; attributed and linked.',
    test: [41.8787, -71.3826], bbox: [41.1, -72.0, 42.1, -71.1], kind: 'arcgis', grain: 'line-section', geometry: 'line', radii: [60, 150, 400], resolvedWithinM: 60,
    publishes: { gen: true, load: false, storage: false }, units: 'MW', queue: 'context',
    layers: [L(RIE, [0], ['Network_ID', 'Substation', 'Substation_Bank', 'Voltage', 'HC', 'DG_In_Queue', 'Map_Refresh_Date', 'Challenging_Feeder', 'Substation_Bank_Anti_Islanding_'], readRi, { for: GEN }),
             L(RIE, [4], ['Network_ID', 'Substation', 'Substation_Bank', 'Voltage', 'DG_In_Queue', 'Map_Refresh_Date', 'Challenging_Feeder'], readRi, { for: GEN })],
    viewerUrl: 'https://www.rienergy.com/site/other-parties/business-partners/rhode-island-system-data-portal', viewerLabel: "Rhode Island Energy's system data portal",
    note: 'Section hosting capacity in MW on three-phase lines; single and two phase sections carry the feeder but no section figure. The layers are stored in RI State Plane, so results are asked for in WGS84. National Grid\'s older RISDP services predate PPL\'s refresh and are not read.' },
  none('pascoag', 'Pascoag Utility District', ['14537'], ['RI'], 'muni', null, 'Pascoag Utility District publishes no hosting capacity; interconnection goes through the district and the RI PUC.'),
  none('biud', 'Block Island Utility District', ['1857'], ['RI'], 'public', null,
    'Block Island Utility District publishes no hosting capacity; the PUC caps net metering at 10% of the island\'s peak load.'),

  /* ═══ TEXAS: nothing is published anywhere in the state (checked utility
     by utility on 2026-10-28; docs/HOSTING-TEXAS.md). The PUCT has no
     hosting-capacity rule: interconnection is 16 TAC §25.211 / §25.212
     (adopted 1999, Project 21220), its staff's 2023 workshop on requiring
     hosting capacity analysis (Project 54233) adopted nothing, and DOE's
     atlas (July 2025) lists no Texas utility. In the ERCOT retail-choice
     areas the WIRES company (the TDU) answers interconnection, never the
     retail provider on the bill. The PUCT's own service-area layers (IOU,
     MUNI, COOP_DIST) carry a licence limiting use to Platts MSA holders, so
     OMEGA never queries them (utility-territory.js); each entry hands the
     person the PUCT's own public boundary viewer instead. ═══ */
  none('oncor', 'Oncor Electric Delivery', ['44372'], ['TX'], 'IOU', 'https://www.oncor.com/us/en/home/smart-energy/renewables-solar-and-more/energy-system-developers.html',
    'Oncor publishes no hosting capacity map; its own developer page offers "prescreen options and project classification" instead. A large DG project (about 500 kW to 10 MW and above) takes a detailed impact study, about 9-12 months; smaller systems apply through Oncor\'s portal (dg@oncor.com) under 16 TAC §25.211/§25.212. Oncor is the wires company (TDU): in its retail-choice territory the retail provider on the bill is not the interconnecting utility.',
    { legal: 'Oncor Electric Delivery Company LLC', verifiedAt: TX_VERIFIED_AT, viewerLabel: 'Oncor\'s energy system developers page',
      route: 'Oncor\'s pre-screen and interconnection application under 16 TAC §25.211/§25.212 (dg@oncor.com; a large project\'s impact study runs about 9-12 months)',
      check: { url: 'https://experience.arcgis.com/experience/a097c23753814128aba0de41bbd729cd', label: 'the PUCT\'s electric service area boundaries viewer' } }),
  none('centerpoint', 'CenterPoint Energy Houston Electric', ['8901'], ['TX'], 'IOU', 'https://www.centerpointenergy.com/en-us/for-business/industry/builders-developers',
    'CenterPoint publishes no hosting capacity map and told the PUCT so (Docket 56211, June 2024): it is "not actively pursuing development of a hosting capacity map" and "does offer a pre-screen in lieu of a hosting capacity map to any prospective customers that would like to interconnect". Interconnection is 16 TAC §25.211/§25.212 and CenterPoint\'s DER application tariff. CenterPoint is the wires company (TDU) in retail-choice Houston.',
    { legal: 'CenterPoint Energy Houston Electric, LLC', verifiedAt: TX_VERIFIED_AT, viewerLabel: 'CenterPoint\'s builders and developers page',
      route: 'CenterPoint\'s pre-screen (offered in lieu of a hosting capacity map) and DER interconnection application under 16 TAC §25.211/§25.212',
      check: { url: 'https://experience.arcgis.com/experience/a097c23753814128aba0de41bbd729cd', label: 'the PUCT\'s electric service area boundaries viewer' } }),
  none('aep-texas', 'AEP Texas', ['20404', '3278'], ['TX'], 'IOU', 'https://www.aeptexas.com/business/builders/generating-equipment',
    'AEP Texas publishes no hosting capacity map; interconnection is an application through its PowerClerk portal to its Distributed Energy Resource Team in San Angelo (DER_AEPTexas@aep.com, 361-881-5333) under 16 TAC §25.211/§25.212. The national territory layer still carries its two pre-merger companies: AEP Texas Central (EIA 3278, Corpus Christi and the Valley) and AEP Texas North (EIA 20404, Abilene), both tagged with AEP\'s Ohio state code. AEP Texas is the wires company (TDU) in its retail-choice territory.',
    { legal: 'AEP Texas Inc.', holding: 'AEP', verifiedAt: TX_VERIFIED_AT, viewerLabel: 'AEP Texas\'s generating equipment page',
      route: 'an interconnection application through AEP Texas\'s PowerClerk (DER_AEPTexas@aep.com, 361-881-5333) under 16 TAC §25.211/§25.212',
      check: { url: 'https://experience.arcgis.com/experience/a097c23753814128aba0de41bbd729cd', label: 'the PUCT\'s electric service area boundaries viewer' } }),
  none('tnmp', 'Texas-New Mexico Power', ['40051'], ['TX'], 'IOU', 'https://www.tnmp.com/customers/interconnecting',
    'TNMP publishes no hosting capacity map; its interconnecting page is the way in, under 16 TAC §25.211/§25.212. Its territory is scattered (parts of the Gulf Coast, west Texas and the Dallas-Fort Worth fringe), so its polygon on the national layer overlaps Oncor\'s; confirm the wires company with the bill or the PUCT\'s viewer. TNMP is the wires company (TDU) in its retail-choice territory.',
    { legal: 'Texas-New Mexico Power Company', verifiedAt: TX_VERIFIED_AT, viewerLabel: 'TNMP\'s interconnecting page',
      route: 'an interconnection application to TNMP under 16 TAC §25.211/§25.212 (its interconnecting page)',
      check: { url: 'https://experience.arcgis.com/experience/a097c23753814128aba0de41bbd729cd', label: 'the PUCT\'s electric service area boundaries viewer' } }),
  none('lpl', 'Lubbock Power & Light', ['11292'], ['TX'], 'muni', 'https://lpandl.com/',
    'Lubbock Power & Light publishes no hosting capacity. It moved its retail customers to ERCOT competition between March and April 2024 (ERCOT\'s own notice) and stays the wires company; a distributed generation interconnection agreement is filed with City of Lubbock Utilities customer service (customerrelations@mylubbock.us). Its sites (lpandl.com and the city\'s) refuse scripted reads, so OMEGA verified the address only to its redirect to the city\'s LP&L page on 2026-10-28; a person\'s browser opens it normally.',
    { legal: 'City of Lubbock (Lubbock Power & Light)', verifiedAt: TX_VERIFIED_AT, viewerLabel: 'Lubbock Power & Light\'s page',
      route: 'LP&L\'s interconnection agreement, filed with City of Lubbock Utilities customer service (customerrelations@mylubbock.us)',
      check: { url: 'https://experience.arcgis.com/experience/a097c23753814128aba0de41bbd729cd', label: 'the PUCT\'s electric service area boundaries viewer' } }),
  none('epe-tx', 'El Paso Electric', ['5701'], ['TX'], 'IOU', 'https://www.epelectric.com/residential/rooftop-solar/texas-interconnection-of-facilities-up-to-10-mw',
    'El Paso Electric publishes no hosting capacity (far west Texas, WECC, outside ERCOT; it also serves New Mexico). It publishes a public DG interconnection QUEUE (applications by status), which is not capacity and is not read as a figure. Texas interconnection of facilities up to 10 MW is by application under the PUCT\'s rules; its distribution interconnection page carries the process. The national layer draws Rio Grande Electric Cooperative over the city of El Paso, where El Paso Electric is the likelier utility; confirm with the bill.',
    { legal: 'El Paso Electric Company', verifiedAt: TX_VERIFIED_AT, viewerLabel: 'El Paso Electric\'s Texas interconnection page',
      route: 'an interconnection application to EPE (facilities up to 10 MW) under the PUCT\'s rules; its public queue shows applications, not capacity',
      check: { url: 'https://experience.arcgis.com/experience/a097c23753814128aba0de41bbd729cd', label: 'the PUCT\'s electric service area boundaries viewer' } }),
  none('sps', 'Southwestern Public Service (Xcel Energy)', ['17718'], ['TX'], 'IOU', 'https://www.xcelenergy.com/working_with_us/how_to_interconnect',
    'Southwestern Public Service (Xcel Energy; the Panhandle and South Plains, SPP, outside ERCOT) publishes no hosting capacity for its Texas system: Xcel\'s hosting capacity maps cover Minnesota and Colorado only (DOE\'s atlas, July 2025, and the TSPA\'s own PUCT filing in Project 54233 say the same). Interconnection is through Xcel\'s application process.',
    { legal: 'Southwestern Public Service Company', holding: 'Xcel Energy', verifiedAt: TX_VERIFIED_AT, viewerLabel: 'Xcel Energy\'s interconnection page',
      route: 'Xcel Energy\'s interconnection application for SPS (its hosting capacity maps cover Minnesota and Colorado only)',
      check: { url: 'https://experience.arcgis.com/experience/a097c23753814128aba0de41bbd729cd', label: 'the PUCT\'s electric service area boundaries viewer' } }),
  none('swepco', 'SWEPCO', ['17698'], ['TX'], 'IOU', 'https://www.swepco.com/business/builders/generating-equipment',
    'SWEPCO (Southwestern Electric Power Company; northeast Texas around Longview and Texarkana, SPP, outside ERCOT) publishes no hosting capacity map. Its generating equipment page names AEP\'s Distributed Generation Coordinator (dgcoordinator@aep.com) as the way in.',
    { legal: 'Southwestern Electric Power Company', holding: 'AEP', verifiedAt: TX_VERIFIED_AT, viewerLabel: 'SWEPCO\'s generating equipment page',
      route: 'an interconnection application to AEP\'s Distributed Generation Coordinator (dgcoordinator@aep.com)',
      check: { url: 'https://experience.arcgis.com/experience/a097c23753814128aba0de41bbd729cd', label: 'the PUCT\'s electric service area boundaries viewer' } }),
  none('entergy-tx', 'Entergy Texas', ['55937'], ['TX'], 'IOU', 'https://www.entergytexas.com/net-metering',
    'Entergy Texas (southeast Texas around Beaumont, Conroe and The Woodlands; MISO, outside ERCOT) publishes no hosting capacity map. Interconnection and billing are Schedule SQF (to 100 kW) or LQF above it, with distributed-scale interconnection governed by Schedule IPODG, which can take a pre-interconnection study; applications go through Entergy\'s interconnection portal.',
    { legal: 'Entergy Texas, Inc.', holding: 'Entergy', verifiedAt: TX_VERIFIED_AT, viewerLabel: 'Entergy Texas\'s net metering page',
      route: 'Schedule SQF (to 100 kW) or LQF with a pre-interconnection study under Schedule IPODG, through Entergy\'s interconnection portal',
      check: { url: 'https://experience.arcgis.com/experience/a097c23753814128aba0de41bbd729cd', label: 'the PUCT\'s electric service area boundaries viewer' } }),
  none('austin-energy', 'Austin Energy', ['1015'], ['TX'], 'muni', 'https://austinenergy.com/green-power/solar-solutions',
    'Austin Energy publishes no hosting capacity. A system interconnects by application under its own DG interconnection guide (its contractors\' guide is public); the city\'s utility is outside ERCOT retail choice, so Austin Energy is both the wires company and the supplier.',
    { legal: 'City of Austin (Austin Energy)', verifiedAt: TX_VERIFIED_AT, viewerLabel: 'Austin Energy\'s solar page',
      route: 'an interconnection application to Austin Energy under its DG interconnection guide',
      check: { url: 'https://experience.arcgis.com/experience/a097c23753814128aba0de41bbd729cd', label: 'the PUCT\'s electric service area boundaries viewer' } }),
  none('cps-energy', 'CPS Energy', ['16604'], ['TX'], 'muni', 'https://www.cpsenergy.com/content/corporate/en/construction-and-renovation/distributed-generation.html',
    'CPS Energy (San Antonio) publishes no hosting capacity. A DG system interconnects by application under its Distributed Generation Manual (being revised in 2024 to add battery storage, microgrids and ERCOT requirements; DG@cpsenergy.com, 210-353-2700). The city\'s utility is outside ERCOT retail choice.',
    { legal: 'City of San Antonio (CPS Energy)', verifiedAt: TX_VERIFIED_AT, viewerLabel: 'CPS Energy\'s distributed generation page',
      route: 'a DG interconnection application under CPS Energy\'s Distributed Generation Manual (DG@cpsenergy.com, 210-353-2700)',
      check: { url: 'https://experience.arcgis.com/experience/a097c23753814128aba0de41bbd729cd', label: 'the PUCT\'s electric service area boundaries viewer' } }),
  none('tx-munis', 'Texas municipal utilities', ['6958', '5063', '7129', '3940'], ['TX'], 'group', 'https://tppa.com/member-utilities/',
    'No Texas municipal utility publishes hosting capacity (Garland, Denton, Bryan, Georgetown, New Braunfels, College Station and the rest); contact the city utility\'s engineering or interconnection office. New Braunfels Utilities is missing from the national territory layer at its own city, so a New Braunfels point can read as its neighbours; confirm with the bill.',
    { verifiedAt: TX_VERIFIED_AT, viewerLabel: 'the Texas Public Power Association\'s member list',
      route: 'the city utility\'s own interconnection application and engineering review',
      group: { states: ['TX'], types: ['MUNICIPAL', 'POLITICAL SUBDIVISION', 'STATE'] } }),
  none('tx-coops', 'Texas electric cooperatives', ['14626', '5078', '1892', '11501', '18976', '8620', '6182', '16638', '16627', '13830', '27369', '3938', '4262', '19159', '20948', '10009', '1175', '7752', '16057', '16063', '19579', '16461', '11364', '17561', '16146', '12452', '1273'], ['TX'], 'group', 'https://texas-ec.org/about/member-directory/',
    'No Texas cooperative publishes hosting capacity (Pedernales, CoServ (Denton County EC), Bluebonnet, Magic Valley, Guadalupe Valley and the rest were checked); ask the co-op\'s own engineering review. The co-ops\' polygons on the national territory layer overlap the metros, so a co-op named beside a TDU inside a city is confirmed with the bill or the PUCT\'s viewer.',
    { verifiedAt: TX_VERIFIED_AT, viewerLabel: 'Texas Electric Cooperatives\' member directory',
      route: 'the cooperative\'s own interconnection application and engineering review',
      group: { states: ['TX'], types: ['COOPERATIVE'] } })
];

/* Territory polygons that are never a point's retail utility: one or a
   handful of customers drawn over whole towns (CT), or a federal
   transmission marketer. */
var NEVER = ['49826', '6207', '27000'];

/* ── lookups ─────────────────────────────────────────────────────────── */
var BY_KEY = {}, BY_EIA = {};
ENTRIES.forEach(function (e) {
  BY_KEY[e.key] = e;
  (e.eiaIds || []).forEach(function (id) { if (!BY_EIA[id] || BY_EIA[id].type === 'group') BY_EIA[id] = e; });
});
function byKey(k) { return BY_KEY[String(k || '')] || null; }
function byEia(id) { return BY_EIA[String(id || '').replace(/\D/g, '')] || null; }
function statesAt(lat, lng) {
  return STATES.filter(function (s) { var b = STATE_BOX[s]; return lat >= b[0] && lat <= b[2] && lng >= b[1] && lng <= b[3]; });
}
/* The entry for a territory candidate at a point: its EIA id, else the
   state's group for its kind of utility. An entry only answers inside the
   states it was researched for, and a group only for a utility OF its state:
   the territory row's own STATE when it carries one (the padded boxes
   overlap, so Felton, Delaware sits in New Jersey's, and Delaware Electric
   Cooperative is not a New Jersey co-op), else the states the point is in. */
function forCandidate(c, states) {
  states = states || [];
  var e = byEia(c && c.eiaId), i;
  function here(s) { return states.indexOf(s) >= 0; }
  if (e && e.states.some(here)) return e;
  if (e && e.type !== 'group') return null;
  var name = String(c && c.name || '').toLowerCase();
  for (i = 0; i < ENTRIES.length && name; i++) {
    var en = ENTRIES[i];
    if (en.names && en.names.some(function (n) { return name.indexOf(n) >= 0; }) && en.states.some(here)) return en;
  }
  var own = c && c.state ? [String(c.state).trim().toUpperCase().slice(0, 2)] : states;
  var type = String(c && c.type || '').toUpperCase();
  for (i = 0; i < ENTRIES.length; i++) {
    var g = ENTRIES[i].group;
    if (g && g.types.indexOf(type) >= 0 && g.states.some(function (s) { return own.indexOf(s) >= 0; }) && ENTRIES[i].states.some(here)) return ENTRIES[i];
  }
  return null;
}
/* The layers a mode needs, primary or fallback. */
function layersFor(spec, mode) {
  return (spec.layers || []).filter(function (l) { return (l.for || ALL).indexOf(mode) >= 0; });
}

/* ── URLs (the door asks exactly these, nothing a body names) ───────── */
function arcgisQuery(layer, id, lat, lng, radiusM, geometry) {
  var qs = [
    'f=json', 'where=' + encodeURIComponent(layer.where || '1=1'),
    'geometry=' + encodeURIComponent(envelope(lat, lng, Math.max(radiusM, 5))), 'geometryType=esriGeometryEnvelope', 'inSR=4326',
    'spatialRel=esriSpatialRelIntersects', 'outFields=' + encodeURIComponent(layer.outFields.join(',')),
    'returnGeometry=true', 'outSR=4326', 'geometryPrecision=6'
  ];
  if (geometry === 'line' || geometry === 'polygon') qs.push('maxAllowableOffset=0.00001');
  return layer.url + '/' + id + '/query?' + qs.join('&');
}
/* ComEd: comed-service builds it, with ComEd's own 46 m attribution rule. */
function comedQuery(layer, lat, lng) {
  return CS.url(CS.ATTRIB_LAYER + '/query', {
    f: 'json', geometry: lng + ',' + lat, geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects',
    distance: CS.NEAREST_M, units: 'esriSRUnit_Meter', outFields: layer.outFields.join(','), returnGeometry: false
  });
}
function comedHeaders() { return CS.headers(); }
var SEASONS = ['SUMMER', 'WINTER', 'SPRING', 'AUTUMN'];
function envelioParcel(host, lat, lng) {
  return 'https://' + host + '/api/gui/apps/grid_connection_navigator/parcels/from_lat_lng/?lat=' + (+lat).toFixed(6) + '&lng=' + (+lng).toFixed(6) + '&behavior=gen&voltage_level=3&category=SUMMER';
}
function envelioSidebar(host, parcelId, behavior, season) {
  return 'https://' + host + '/api/gui/apps/grid_connection_navigator/parcels/parcel_sidebar_general_tab/' + encodeURIComponent(String(parcelId)) +
    '/?behavior=' + behavior + '&voltage_level=3&category=' + season;
}
function webmapData(id) { return 'https://www.arcgis.com/sharing/rest/content/items/' + encodeURIComponent(id) + '/data?f=json'; }
/* Every operational-layer URL in a web map, groups included, matching the
   layer's resolve pattern; the newest date in the name wins. */
function resolveFromWebmap(data, match) {
  var re = new RegExp(match), found = [];
  (function walk(ls) { (ls || []).forEach(function (l) { if (l && typeof l.url === 'string' && re.test(l.url)) found.push(l.url); if (l && l.layers) walk(l.layers); }); })(data && data.operationalLayers);
  function stamp(u) { var m = /(\d{1,2})_(\d{1,2})_(\d{4})\/FeatureServer/.exec(u); return m ? +m[3] * 10000 + +m[1] * 100 + +m[2] : 0; }
  found.sort(function (a, b) { return stamp(b) - stamp(a); });
  if (!found.length) return null;
  var m = /^(https:\/\/[^?#]+?\/FeatureServer)/.exec(found[0]);
  return m && /^https:\/\/services\d*\.arcgis\.com\//.test(m[1]) ? m[1] : null;
}

/* ── the adapter: raw features -> circuits ──────────────────────────────
   featuresByLayer: [{ layer, features:[{attributes, geometry}] }] (arcgis)
   or [{ envelio:[sidebar answers tagged with behavior] }].
   Returns circuits sorted nearest first (ties: most room first), each in
   the C6 shape. */
var NUM_KEYS = ['gen', 'load', 'storage', 'charge', 'discharge', 'genQueue', 'loadQueue', 'capKw'];
function partsOf(featuresByLayer, lat, lng, geometry) {
  var parts = [];
  (featuresByLayer || []).forEach(function (fl) {
    if (fl.envelio) { var p = readEnvelio(fl.envelio); if (p) { p.join = false; parts.push(p); } return; }
    var layer = fl.layer;
    (fl.features || []).forEach(function (f) {
      var got = layer.read(f.attributes || {});
      if (!got) return;
      var d = layer.comed ? 0 : distanceM(f.geometry, lat, lng);
      (Array.isArray(got) ? got : [got]).forEach(function (p) {
        if (p.distanceM === undefined || p.distanceM === null) p.distanceM = d;
        p.join = !!layer.join;
        parts.push(p);
      });
    });
  });
  return parts;
}
function better(a, b) { /* nearer wins; unknown distance counts as far */
  var da = a.distanceM == null ? 1e9 : a.distanceM, db = b.distanceM == null ? 1e9 : b.distanceM;
  return da <= db ? a : b;
}
function merge(group) {
  var out = { id: group[0].id, name: '', sub: '', kv: null, phase: '', refreshed: null, upstream: {}, flags: [], distanceM: null };
  var nearest = group.reduce(better);
  out.distanceM = group.filter(function (p) { return !p.join; }).reduce(function (m, p) { return p.distanceM == null ? m : (m == null ? p.distanceM : Math.min(m, p.distanceM)); }, null);
  if (out.distanceM == null) out.distanceM = nearest.distanceM;
  /* each field from the nearest part that has it */
  var sorted = group.slice().sort(function (a, b) { var da = a.distanceM == null ? 1e9 : a.distanceM, db = b.distanceM == null ? 1e9 : b.distanceM; return da - db; });
  ['name', 'sub', 'phase', 'refreshed', 'capNote'].forEach(function (k) { for (var i = 0; i < sorted.length; i++) if (sorted[i][k]) { out[k] = sorted[i][k]; return; } });
  function has(p, k) { return p[k] !== undefined && p[k] !== null; }
  ['kv'].concat(NUM_KEYS.filter(function (k) { return k !== 'gen' && k !== 'load'; })).forEach(function (k) {
    for (var i = 0; i < sorted.length; i++) if (has(sorted[i], k)) { out[k] = sorted[i][k]; return; }
    out[k] = null;
  });
  /* a figure and its band are one reading: both from the nearest part that has either */
  [['gen', 'genBand'], ['load', 'loadBand']].forEach(function (pair) {
    out[pair[0]] = null; out[pair[1]] = null;
    for (var i = 0; i < sorted.length; i++) if (has(sorted[i], pair[0]) || has(sorted[i], pair[1])) {
      out[pair[0]] = has(sorted[i], pair[0]) ? sorted[i][pair[0]] : null; out[pair[1]] = has(sorted[i], pair[1]) ? sorted[i][pair[1]] : null; return;
    }
  });
  sorted.forEach(function (p) {
    Object.keys(p.upstream || {}).forEach(function (k) {
      var v = p.upstream[k];
      if (v === null || v === undefined) return;
      if (typeof v === 'number') out.upstream[k] = out.upstream[k] == null ? v : Math.min(out.upstream[k], v);
      else if (!out.upstream[k]) out.upstream[k] = v;
    });
    (p.flags || []).forEach(function (f) { if (out.flags.indexOf(f) < 0) out.flags.push(f); });
  });
  return out;
}
function round(n) { return n == null ? null : Math.round(n); }
function kwText(n) { return Math.round(n).toLocaleString('en-US') + ' kW'; }
/* of two published ranges with the same low end, the one with the lower top */
function tighter(a, b) {
  var ha = a.maxKw == null ? Infinity : a.maxKw, hb = b.maxKw == null ? Infinity : b.maxKw;
  return hb < ha ? b : a;
}
/* The figures as published, before any queue or restriction (normalize
   applies those, in that order). A side read from a published range keeps
   its band, in storage mode too: the smaller side sets the storage figure
   and ITS band rides with it, so JCP&L's "Less than 100 kW AC" is judged as
   a band at its low end, never printed as "0 kW published". On a tie an
   exact figure on either side is the figure. */
function judgeable(m, mode) {
  var gen = m.gen, load = m.load, bandG = m.genBand, bandL = m.loadBand;
  var genKw = gen != null ? gen : (bandG ? bandG.minKw : null);
  var loadKw = load != null ? load : (bandL ? bandL.minKw : null);
  var gB = gen == null && bandG ? bandG : null, lB = load == null && bandL ? bandL : null;
  var storageKw = null, storageBand = null;
  if (m.storage != null) storageKw = m.storage;
  else if (m.charge != null && m.discharge != null) storageKw = Math.min(m.charge, m.discharge);
  else if (m.charge == null && m.discharge == null && genKw != null && loadKw != null) {
    storageKw = Math.min(genKw, loadKw);
    storageBand = genKw < loadKw ? gB : (loadKw < genKw ? lB : (gB && lB ? tighter(gB, lB) : null));
  }
  if (m.discharge != null && genKw == null) genKw = m.discharge;
  if (m.charge != null && loadKw == null) loadKw = m.charge;
  var basis, published, bandOut = null, queued;
  if (mode === 'load') { basis = 'load'; published = loadKw; bandOut = lB; queued = m.loadQueue; }
  else if (mode === 'export') { basis = 'gen'; published = genKw; bandOut = gB; queued = m.genQueue; }
  else if (storageKw != null) { basis = 'storage'; published = storageKw; bandOut = storageBand; queued = m.genQueue; }
  else if (genKw != null) { basis = 'gen'; published = genKw; bandOut = gB; queued = m.genQueue; }
  else if (loadKw != null) { basis = 'load'; published = loadKw; bandOut = lB; queued = m.loadQueue; }
  else { basis = m.publishesLoadOnly ? 'load' : 'gen'; published = null; queued = null; }
  return { genKw: genKw, loadKw: loadKw, storageKw: storageKw, basis: basis, publishedKw: published,
           band: bandOut ? { minKw: round(bandOut.minKw), maxKw: round(bandOut.maxKw), text: bandOut.text || '' } : null,
           queuedKw: queued == null ? null : queued };
}
function normalize(entry, spec, featuresByLayer, ctx) {
  ctx = ctx || {};
  var mode = MODES.indexOf(ctx.mode) >= 0 ? ctx.mode : 'storage';
  var parts = partsOf(featuresByLayer, ctx.lat, ctx.lng, (spec && spec.geometry) || entry.geometry);
  var groups = {}, order = [];
  parts.forEach(function (p) {
    if (p.join) return;
    var k = p.id || '';
    if (!groups[k]) { groups[k] = []; order.push(k); }
    groups[k].push(p);
  });
  parts.forEach(function (p) { if (p.join && groups[p.id || '']) groups[p.id || ''].push(p); });
  var loadOnly = entry.publishes && !entry.publishes.gen && entry.publishes.load;
  var qmode = entry.queue || 'subtract', netted = qmode === 'netted';
  var circuits = order.map(function (k) {
    var m = merge(groups[k]);
    m.publishesLoadOnly = loadOnly;
    var j = judgeable(m, mode);
    var q = j.queuedKw, context = null, pub = j.publishedKw, band = j.band, queueNetted = netted && q != null;
    if (qmode === 'context') {
      context = q;
      q = null;
      if (context != null) m.flags.push('feeder queue ' + Math.round(context).toLocaleString('en-US') + ' kW, shown beside the figure, not subtracted (no queue is published with a section figure)');
    }
    var net = pub == null ? null : Math.max(0, pub - (netted || q == null ? 0 : q));
    /* A restriction on new DER caps what the queue LEAVES (ACE: min(max(0,
       figure − pending), restriction)), never the figure before the queue.
       Where it binds, the restriction is the figure and the queue is already
       in it, so it is shown, never subtracted again. */
    if (m.capKw != null && mode !== 'load') {
      if (m.capNote && m.flags.indexOf(m.capNote) < 0) m.flags.push(m.capNote);
      if (net != null && net > m.capKw) {
        if (q != null && !netted) m.flags.push('the restriction binds: ' + kwText(pub) + ' published less ' + kwText(q) + ' queued leaves ' + kwText(net) + ', more than the ' + kwText(m.capKw) + ' restriction');
        pub = m.capKw; net = m.capKw; band = null; queueNetted = q != null;
        if (j.genKw != null) j.genKw = Math.min(j.genKw, m.capKw);
        if (j.storageKw != null) j.storageKw = Math.min(j.storageKw, m.capKw);
      }
    }
    return {
      id: m.id ? (m.id.length > 40 ? m.id.slice(0, 40) : m.id) : '',
      name: m.name || '', substation: m.sub || '', kv: m.kv,
      genKw: round(j.genKw), loadKw: round(j.loadKw), storageKw: round(j.storageKw),
      basis: j.basis, publishedKw: round(pub), queuedKw: q == null ? null : round(q), queueNetted: queueNetted,
      band: band,
      upstream: { transformerKw: round(m.upstream.transformerKw), bankKw: round(m.upstream.bankKw), substationKw: round(m.upstream.substationKw), pnode: m.upstream.pnode || null,
                  feederQueuedKw: context == null ? null : round(context) },
      distanceM: m.distanceM == null ? null : Math.round(m.distanceM),
      refreshed: m.refreshed || null, phase: m.phase || '', notes: m.flags.slice(0, 6),
      _net: net
    };
  });
  /* A two-sided source (generation and load, or charge and discharge): when
     some circuit at the point has both sides, one that has only one side
     here is listed but not judged as if it were the storage figure. */
  if (mode === 'storage' && circuits.some(function (c) { return c.storageKw != null; })) {
    circuits.forEach(function (c) {
      if (c.storageKw == null && c.publishedKw != null) {
        c.notes.push('only the ' + (c.basis === 'gen' ? 'generation' : 'load') + ' side of this circuit was found near the point');
        c.publishedKw = null; c.band = null; c._net = null;
      }
    });
  }
  circuits.sort(function (a, b) {
    var va = a.publishedKw != null ? 0 : 1, vb = b.publishedKw != null ? 0 : 1;
    if (va !== vb) return va - vb;
    var da = a.distanceM == null ? 0 : Math.round(a.distanceM / 10), db = b.distanceM == null ? 0 : Math.round(b.distanceM / 10);
    if (da !== db) return da - db;
    return (b._net || 0) - (a._net || 0);
  });
  circuits.forEach(function (c) { delete c._net; });
  return circuits.slice(0, 12);
}

/* The circuit body POST /api/grid-verdict and the door's own GV.judge read. */
function body(entry, source, c, mode) {
  if (!c) return null;
  return { utility: entry.display, id: c.id, substation: c.substation, publishedKw: c.publishedKw, queuedKw: c.queuedKw,
    queueNetted: c.queueNetted, basis: c.basis, band: c.band, addressResolved: !!(source && source.addressResolved),
    grain: (source && source.grainWords) || entry.grain, source: source ? source.label : entry.display, mode: mode || 'storage' };
}

/* What a utility that may serve the point publishes, for the list the
   circuit step draws beside the answer: the status in words, the route it
   offers instead of a map, and the pages a person opens (its own page and,
   where it has one, its own address lookup). A candidate the registry does
   not know is said to be unresearched, never guessed. */
var SAYS = { verified: 'publishes hosting capacity', metadata: 'publishes a hosting capacity layer OMEGA has not proven',
  candidate: 'publishes a layer whose units OMEGA has not proven', account: 'publishes hosting capacity to registered users only',
  none: 'publishes no hosting capacity' };
function publication(entry) {
  if (!entry) return { status: 'unknown', says: 'not researched by OMEGA', route: null, link: null, check: null, verifiedAt: null };
  return { status: entry.status, says: SAYS[entry.status] || entry.status, route: entry.route || null,
    link: entry.viewerUrl ? { url: entry.viewerUrl, label: entry.viewerLabel || entry.display + '\'s page' } : null,
    check: entry.check ? { url: entry.check.url, label: entry.check.label } : null, verifiedAt: entry.verifiedAt || null };
}

/* GET ?coverage=1: who is covered and how, never a URL or a field. */
function coverage() {
  return ENTRIES.map(function (e) {
    return { key: e.key, display: e.display, states: e.states.slice(), status: e.status, type: e.type,
      grain: e.grain || null, publishes: { gen: !!(e.publishes && e.publishes.gen), load: !!(e.publishes && e.publishes.load), storage: !!(e.publishes && e.publishes.storage) },
      verifiedAt: e.verifiedAt };
  });
}

var GRAIN_WORDS = { circuit: "the utility's circuit at the address", 'grid-cell': 'the nearest published grid cell', 'service-point': 'the nearest service point',
  transformer: 'the nearest transformer point', 'line-section': 'the nearest line section', 'line-segment': 'the nearest line segment', parcel: 'the parcel' };

module.exports = {
  VERSION: VERSION, VERIFIED_AT: VERIFIED_AT, AZ_VERIFIED_AT: AZ_VERIFIED_AT, TX_VERIFIED_AT: TX_VERIFIED_AT, STATES: STATES, MODES: MODES, ENTRIES: ENTRIES, NEVER: NEVER, DOE_ATLAS: DOE_ATLAS,
  SEASONS: SEASONS, GRAIN_WORDS: GRAIN_WORDS, STATE_BOX: STATE_BOX, SAYS: SAYS,
  byKey: byKey, byEia: byEia, statesAt: statesAt, forCandidate: forCandidate, layersFor: layersFor,
  arcgisQuery: arcgisQuery, comedQuery: comedQuery, comedHeaders: comedHeaders, envelioParcel: envelioParcel, envelioSidebar: envelioSidebar,
  webmapData: webmapData, resolveFromWebmap: resolveFromWebmap, edgeOf: edgeOf,
  normalize: normalize, body: body, coverage: coverage, publication: publication,
  _t: { num: num, kwString: kwString, toKw: toKw, band: band, list: list, kvOf: kvOf, dateOf: dateOf, distanceM: distanceM, envelope: envelope,
        readEnvelio: readEnvelio, partsOf: partsOf }
};
