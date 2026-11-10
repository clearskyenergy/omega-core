/* ═══════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · omega-zoning-watch.js  (v1 · 2026-11-09)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Zoning & legislation, as REPORTED, for a pin: the local moratoria and
   zoning measures on file for the pin's county, and the state laws and
   bills on file for its state, for data centers, battery storage and EV
   charging.

   WHY: section 2 of the site readiness checklist (Zoning & Land Use) was
   five open items and nothing else — the page could not say that a county
   had a data-center moratorium on the books or that a state bill was moving
   (2026-11-09, Tommy, of a competitor's tracker: "take this site and find
   out what we can use"). What was used is the IDEA. Every record here was
   gathered from a primary public source or a news report, with the link on
   it; no compiled commercial tracker is a source.

   WHAT THIS IS NOT
     · It is NOT a legal status. A record says what a source REPORTED, on
       the date it was read. Chamber passage is not enactment. An expiry
       date that has passed is not proof a measure lapsed (measures get
       extended) and is shown as "expiry date passed — confirm".
     · It is NOT complete. "None on file" means the tracker holds no record
       for the county — it never means no restriction exists. That reading
       is conditional, not a pass, on purpose.
     · It is NOT a parcel determination. A municipal measure applies inside
       that municipality; the tracker matches by COUNTY (what the pin gives
       it) and says so.
     · It is not legal advice.

   DATA: /data/zoning/measures.json (hand-curated, source on every record;
   docs/ZONING-LEGISLATION.md). ES5 on purpose; judge() and match() are pure
   and scripts/tests/tzoningwatch.js holds them. Only load() touches the
   network, and only this origin.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var DATA_URL = '/data/zoning/measures.json';
  var STATE_FIPS = { '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY' };
  var SUBJECT = { 'data-center': 'data centers / large loads', 'bess': 'battery storage', 'ev-charging': 'EV charging' };
  var STATUS = { proposed: 'Proposed', pending: 'Pending', enacted: 'Enacted', active: 'Active', rejected: 'Rejected', expired: 'Expired', withdrawn: 'Withdrawn', watch: 'Policy watch' };
  var IN_FORCE = { enacted: 1, active: 1 }, MOVING = { proposed: 1, pending: 1, watch: 1 };
  var DISCLAIMER = 'Reported, not verified legal status. Coverage is incomplete; confirm current law, dates and whether the site is inside the jurisdiction with the planning department. Not legal advice.';

  /* a census GEOID (block, tract, county) → the state and county it starts with */
  function fipsOf(geoid) {
    var g = String(geoid == null ? '' : geoid).replace(/[^0-9]/g, '');
    if (g.length < 5) return null;
    var st = STATE_FIPS[g.slice(0, 2)];
    return st ? { state: st, stateFips: g.slice(0, 2), county: g.slice(0, 5) } : null;
  }
  function dayOf(v) { var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ''; }

  /* what a record is TODAY, as far as the tracker may say: its reported
     status, except that an in-force measure whose expiry date has passed is
     "lapsed?" — a question for the jurisdiction, not a finding */
  function standing(r, today) {
    var s = String(r.status || '').toLowerCase();
    if (IN_FORCE[s] && dayOf(r.expires) && dayOf(today) && dayOf(r.expires) < dayOf(today)) return 'lapsed?';
    return STATUS[s] ? s : 'watch';
  }
  function about(r, subject) { return !subject || !r.subjects || r.subjects.indexOf(subject) >= 0; }
  /* what leads a list. LOCAL: a restriction in force, then one whose expiry
     passed, then one moving — a proposed moratorium matters more to a site
     than an enacted rezoning next door. STATE: what is law first (a
     restriction before the rest), then what is moving. */
  function rank(r, today) {
    var st = standing(r, today), restrictive = r.effect === 'restrictive';
    if (r.level === 'state') return IN_FORCE[st] ? (restrictive ? 0 : 1) : st === 'lapsed?' ? 2 : MOVING[st] ? (restrictive ? 3 : 4) : 5;
    return (restrictive && IN_FORCE[st] ? 0 : restrictive && st === 'lapsed?' ? 1 : restrictive && MOVING[st] ? 2 : IN_FORCE[st] ? 3 : MOVING[st] ? 4 : 5);
  }
  /* "City of Tulsa" → "tulsa": the place a searched address may name. The
     pin gives the COUNTY, never the municipality — but when the address the
     person typed names the city, that city's measures lead their rank. It
     orders; it never filters, because the hint may be wrong. */
  function placeOf(r) {
    var m = String(r.jurisdiction || '').match(/^(?:City|Town|Village) of (.+)$/i) || String(r.jurisdiction || '').match(/^(.+?) Township$/i);
    return m ? m[1].toLowerCase() : '';
  }
  function named(r, hint) { var pl = placeOf(r); return !!(pl && hint && new RegExp('(^|[^a-z])' + pl.replace(/[^a-z0-9 ]/g, '.') + '([^a-z]|$)').test(hint)); }
  function order(list, today, hint) {
    hint = String(hint || '').toLowerCase();
    return list.slice().sort(function (a, b) {
      return rank(a, today) - rank(b, today) || (named(b, hint) - named(a, hint))
        || (dayOf(b.statusDate) < dayOf(a.statusDate) ? -1 : dayOf(b.statusDate) > dayOf(a.statusDate) ? 1 : 0) || (a.id < b.id ? -1 : 1);
    });
  }

  /* ── pure: the records on file for a place and a subject ──────────────── */
  function match(data, q) {
    q = q || {};
    var out = { covered: false, state: [], local: [] }, recs = (data && data.records) || [], today = q.today || new Date().toISOString();
    if (!data || !q.state) return out;
    out.covered = (data.states || []).indexOf(q.state) >= 0;
    if (!out.covered) return out;
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (r.state !== q.state || !about(r, q.subject)) continue;
      if (r.level === 'state') out.state.push(r);
      else if (q.county && (r.countyFips || []).indexOf(q.county) >= 0) out.local.push(r);
    }
    out.state = order(out.state, today); out.local = order(out.local, today, q.placeHint);
    return out;
  }

  function label(r) { return (r.jurisdiction ? r.jurisdiction + ' — ' : '') + r.title; }
  function count(list, test) { var n = 0; for (var i = 0; i < list.length; i++) if (test(list[i])) n++; return n; }

  /* ── pure: the two readings a due-diligence checklist takes ─────────────
     q: { state, county (5-digit FIPS), countyName, subject, placeHint, today }
     Each row: { status: risk | conditional | unknown, value, note }.
     There is no "pass": a tracker that found nothing has cleared nothing. */
  function judge(data, q) {
    q = q || {};
    var today = q.today || new Date().toISOString(), m = match(data, q), what = SUBJECT[q.subject] || 'these project types';
    var where = q.countyName ? q.countyName : 'this county';
    var res = { covered: m.covered, local: m.local, state: m.state, disclaimer: DISCLAIMER, asOf: data && data.builtAt ? dayOf(data.builtAt) : '' };
    if (!data) { res.rows = { local: unk('Zoning tracker not loaded — not a reading.'), state: unk('Zoning tracker not loaded — not a reading.') }; return res; }
    if (!q.state) { res.rows = { local: unk('County not resolved yet (it comes from the FCC lookup at the pin).'), state: unk('State not resolved yet.') }; return res; }
    if (!m.covered) { var no = unk('The tracker has no coverage for ' + q.state + ' yet — not a reading. Ask the planning department and check the legislature.'); res.rows = { local: no, state: no }; return res; }

    function act(r) { return r.effect === 'restrictive' && IN_FORCE[standing(r, today)]; }
    function lapsed(r) { return r.effect === 'restrictive' && standing(r, today) === 'lapsed?'; }
    function moving(r) { return r.effect === 'restrictive' && MOVING[standing(r, today)]; }

    /* local */
    var L = m.local, nA = count(L, act), nL = count(L, lapsed), nM = count(L, moving), local;
    if (!q.county) local = unk('County not resolved yet (it comes from the FCC lookup at the pin).');
    else if (nA) local = { status: 'risk', value: nA + ' reported in force', note: label(L[0]) + (nA > 1 ? ' and ' + (nA - 1) + ' more' : '') + '. Reported for ' + where + ' — a municipal measure applies inside that municipality; confirm the site is inside it and that the measure still stands.' };
    else if (nL) local = { status: 'conditional', value: nL + ' reported, expiry date passed', note: label(L[0]) + '. Its reported expiry date has passed — it may have lapsed or been extended. Confirm with the jurisdiction.' };
    else if (nM) local = { status: 'conditional', value: nM + ' reported as proposed or pending', note: label(L[0]) + (nM > 1 ? ' and ' + (nM - 1) + ' more' : '') + '. Not in force as reported — watch the docket before committing.' };
    else if (L.length) local = { status: 'conditional', value: L.length + ' measure' + (L.length === 1 ? '' : 's') + ' on file', note: label(L[0]) + '. None reported as a restriction in force on ' + what + '.' };
    else local = { status: 'conditional', value: 'none on file', note: 'The tracker holds no local measure on ' + what + ' for ' + where + '. Coverage is incomplete — this is not a finding that none exists. Ask the planning department.' };

    /* state: a law adds requirements or incentives; only a state moratorium
       in force is a risk on its own */
    var S = m.state, sMor = count(S, function (r) { return act(r) && r.type === 'moratorium'; }), sIn = count(S, function (r) { return IN_FORCE[standing(r, today)]; }), sMv = count(S, function (r) { return MOVING[standing(r, today)]; }), state;
    if (sMor) state = { status: 'risk', value: sMor + ' state moratorium reported', note: label(S[0]) + '. Confirm its scope and current status with the state.' };
    else if (S.length) state = { status: 'conditional', value: sIn + ' in force · ' + sMv + ' moving', note: 'On file for ' + q.state + ' on ' + what + ': ' + label(S[0]) + (S.length > 1 ? ' and ' + (S.length - 1) + ' more' : '') + '. Read each against the project — a bill that passed one chamber is not law.' };
    else state = { status: 'conditional', value: 'none on file', note: 'The tracker holds no ' + q.state + ' state measure on ' + what + '. Coverage is incomplete — check the legislature and the utility commission.' };
    res.rows = { local: local, state: state };
    return res;
  }
  function unk(note) { return { status: 'unknown', value: '—', note: note }; }

  /* ── network: the dataset, once ────────────────────────────────────────── */
  var cached = null, waiting = null, failed = null;
  function load(cb) {
    if (cached) return cb(null, cached);
    if (failed) return cb(failed);
    if (waiting) return void waiting.push(cb);
    waiting = [cb];
    function done(err, data) { if (err) failed = err; else cached = data; var w = waiting; waiting = null; for (var i = 0; i < w.length; i++) w[i](err, data); }
    if (typeof XMLHttpRequest === 'undefined') return done(new Error('no network client'));
    var x = new XMLHttpRequest(); x.open('GET', DATA_URL, true); x.timeout = 20000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      if (x.status >= 200 && x.status < 300) { try { done(null, JSON.parse(x.responseText)); } catch (e) { done(e); } }
      else done(new Error('HTTP ' + x.status));
    };
    x.ontimeout = function () { done(new Error('timeout')); };
    x.send();
  }

  var API = { DATA_URL: DATA_URL, SUBJECT: SUBJECT, STATUS: STATUS, DISCLAIMER: DISCLAIMER, STATE_FIPS: STATE_FIPS,
              fipsOf: fipsOf, standing: standing, match: match, judge: judge, load: load };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) global.OmegaZoningWatch = API;
})(typeof window !== 'undefined' ? window : null);
