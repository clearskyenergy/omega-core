/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/diligence.js — compute-site DUE DILIGENCE on the
   register: where a site stands, the seven gates it must clear, the four
   ways it comes under control, the offtake that pays for it, and the call
   made on it
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE and ES5: no Firestore, no network, no clock (every function is handed
   `now`). api/site-crm.js is the ONE door that reads and writes the record;
   this decides. Built for a workspace that BUYS sites to put storage,
   charging and compute on them (2026-10-25, Solela Capital: "The power is
   already in the ground. We put it to work."), where one person moves fast
   through incoming sites, checks each one and marks the ones to take under
   control.

   THE SWITCH. billing/current.toolOverrides['portfolio-diligence'] === true,
   literally (enabled()), staff-written by
   scripts/enable-portfolio-diligence.js, the way the register reads
   toolOverrides['portfolio-assets']. Off is the default: every other
   workspace's portfolio is unchanged, every diligence action refuses and the
   pages draw nothing new. The workspace's OWN lists — intake types, host
   deals, exclusions, the offtake defaults, the target deal, the removal
   window — are its config, billing/current.portfolioDiligence
   (normalizeConfig), never constants here: with none configured a list is
   empty, a default is absent and the view says so.

   THE RECORD. omega_orgs/{org}/sites/{id}.diligence (Admin SDK only):
     stage      brought-in → screened → pursue → loi-sent → offtake → msa →
                confirmed (the offtake partner's own order: sites, LOI,
                offtake, MSA, site survey, confirmed), or passed. A forward
                move is earned (requirement()); a move back needs a note;
                pursue and pass are the CALL (decide()), not a drag. The
                approved mockup's words: pursue reads Earmarked, the call
                Earmark (STAGE_LABEL, CALL_LABEL); the keys are unchanged.
     decision   { choice: pursue|pass, reason, by, at }. Pursue = take the
                site under control. A pass needs a reason.
     WHO        every change is any editor's: owner, admin or member (the
                door's edit capability); a viewer only reads. Nothing is held
                back for an owner (2026-10-25: the workspace's one person is
                a member). The switch is staff's.
     gates      power · interconnection · fiber · control · chips · offtake
                · economics, each { state, value{}, source, evidenceFileId,
                by, at }:
                  open       nothing checked yet
                  screened   PUBLIC data only (source.kind 'public'; chips
                             may rest on the sizing, and read Chosen)
                  working    in hand with a counterparty (In progress)
                  confirmed  a DOCUMENT on the site's Files, of a kind the
                             gate names (CONFIRMED_BY; the control route's
                             own for control)
                  fails      with a reason
                Economics is never a person's word: it follows the economics
                on file (economicsGate), confirmed only by the contract case
                run on the confirmed offtake and control terms.
     screen     the Grid Atlas screen (grid-screen.js), landed by the
                system's own change('screen'): gates to screened, never to
                confirmed, never past a person's own state.
     control    { route: own|buy|lease|takeover, … } the route's own terms.
                The paper is the register's agreements subcollection
                (assets.js; AGREEMENT_TYPES below join its list when the door
                is wired), linked by agreementId: the signed agreement's
                endDate and computePermitted win over typed terms.
     offtake    { partner, loiStatus, offtaker, termYears, pricePerGpuHour,
                takeOrPayPct, feePct, status, startDate }. The offtaker is the
                parked Compute desk's counterparty (compute-desk.js
                offtakerInput) less its price, term and status, which are the
                offtake's own fields, so each fact has one home.
     chargers   { count, kw, status: operating|dark, network, use, peak }.
                kw is NAMEPLATE and is never subtracted: the headroom is the
                service less the MEASURED peak (headroom()).
     survey     the site survey the partner's order puts before confirmed.
     history[]  every change, capped; omega_audit is the door's.

   DERIVED AT READ TIME, NEVER STORED: an exclusion's automatic pass (a rule
   of the workspace's config matched on a RECORDED value; an editor reverses
   it with a reason, kept as an override), the headroom, the control term
   check (control must outlast the offtake term plus the removal window), the
   economics gate, a confirmation whose document left the Files, and the next
   step. No false results: a figure that is not on the record is null and
   named, never a default dressed as a fact.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var P = require('./power');

/* ── the vocabulary: the data model (a workspace's own lists are config) ── */
var FLAG = 'portfolio-diligence', CONFIG_KEY = 'portfolioDiligence', VERSION = 1;
var STAGES = ['brought-in', 'screened', 'pursue', 'loi-sent', 'offtake', 'msa', 'confirmed'];
var PASSED = 'passed';
/* the words are the approved mockup's (2026-10-25): the pursue stage reads
   Earmarked and the call Earmark; the keys stay as the data model names them */
var STAGE_LABEL = { 'brought-in': 'Brought in', screened: 'Screened', pursue: 'Earmarked', 'loi-sent': 'LOI sent', offtake: 'Offtake', msa: 'MSA', confirmed: 'Confirmed', passed: 'Passed' };
var CALL_LABEL = { pursue: 'Earmark', pass: 'Pass', reopen: 'Reopen' };
var STAGE_HINT = { 'brought-in': 'New, not yet checked', screened: 'Power, interconnection and fiber screened', pursue: 'Earmarked to take under control', 'loi-sent': 'The LOI is with the offtake partner',
  offtake: 'An offtaker on agreed terms', msa: 'The offtake contract signed', confirmed: 'Every gate on its document and the site surveyed', passed: 'Not taken, with the reason' };
var GATES = ['power', 'interconnection', 'fiber', 'control', 'chips', 'offtake', 'economics'];
var GATE_LABEL = { power: 'Power', interconnection: 'Interconnection', fiber: 'Fiber', control: 'Site control', chips: 'Chips', offtake: 'Offtake', economics: 'Economics' };
var GATE_SHORT = { power: 'Pwr', interconnection: 'IX', fiber: 'Fbr', control: 'Ctl', chips: 'Chip', offtake: 'Off', economics: '$' };
var GATE_STATES = ['open', 'screened', 'working', 'confirmed', 'fails'];
var STATE_LABEL = { open: 'Open', screened: 'Screened', working: 'In progress', confirmed: 'Confirmed', fails: 'Fails' };
/* a gate's own word for a state, where the mockup has one: chips screened on the sizing are Chosen */
var GATE_STATE_LABEL = { chips: { screened: 'Chosen' } };
function stateLabel(k, st) { return GATE_STATE_LABEL[k] && GATE_STATE_LABEL[k][st] || STATE_LABEL[st]; }
/* the gates a site is screened on before it is called screened */
var SCREEN_GATES = ['power', 'interconnection', 'fiber'];
var SOURCE_KINDS = ['public', 'counterparty', 'document', 'model', 'internal'];
var DOCS = {
  'will-serve': 'Utility will-serve letter', 'interconnection-agreement': 'Interconnection agreement', 'carrier-quote': 'Fiber carrier quote',
  deed: 'Deed', 'purchase-agreement': 'Signed purchase agreement', lease: 'Signed lease',
  assignment: 'Assignment of the site host agreement', amendment: 'Amendment permitting compute and storage',
  'chip-allocation': 'Chip allocation or purchase order', 'offtake-contract': 'Offtake contract', msa: 'Master services agreement',
  'site-survey': 'Site survey report'
};
var CONFIRMED_BY = { power: ['will-serve'], interconnection: ['will-serve', 'interconnection-agreement'], fiber: ['carrier-quote'], chips: ['chip-allocation'], offtake: ['offtake-contract', 'msa'] };
var ROUTES = {
  own: { label: 'Own', noun: 'ownership', confirmedBy: ['deed'], words: 'the deed', agreementTypes: ['deed'] },
  buy: { label: 'Buy', noun: 'a purchase', confirmedBy: ['purchase-agreement', 'deed'], words: 'the signed purchase agreement, and the deed closes it', agreementTypes: ['purchase_agreement', 'deed'] },
  lease: { label: 'Lease', noun: 'a lease', confirmedBy: ['lease'], words: 'the signed lease', agreementTypes: ['lease'] },
  /* an EVCS-style host agreement limits use to charging and hands the
     equipment to the host at term end: both are amended, so the takeover
     is confirmed by the assignment AND the amendment */
  takeover: { label: 'Take over the site host agreement', noun: 'a takeover of the host agreement', confirmedBy: ['assignment'], alsoNeeds: 'amendment',
    words: 'the assignment of the site host agreement, with the amendment beside it', agreementTypes: ['site_host_agreement', 'assignment', 'amendment'] }
};
var ROUTE_KEYS = ['own', 'buy', 'lease', 'takeover'];
/* the agreement types the routes add to assets.js AGREEMENT_TYPES */
var AGREEMENT_TYPES = ['deed', 'purchase_agreement', 'assignment', 'amendment'];
var LOI = ['none', 'drafted', 'sent', 'signed', 'declined'];
var OFFTAKE_STATUS = ['none', 'seeking', 'proposed', 'term-sheet', 'executed', 'declined'];
var COMMERCIAL = ['termYears', 'pricePerGpuHour', 'takeOrPayPct', 'feePct'];
var CHARGER_STATUS = ['operating', 'dark'];
var CHARGER_USE = ['public', 'fleet', 'workplace', 'retail', 'residential', 'amenity'];
/* where a MEASURED peak comes from; nameplate is not on the list */
var PEAK_SOURCES = ['interval', 'bill', 'utility', 'meter', 'network'];
var PEAK_LABEL = { interval: 'interval data', bill: 'a utility bill (billed demand)', utility: 'the utility', meter: 'the meter', network: 'the charging network', entered: 'the existing peak on the site record (as entered)', reported: 'the reported peak (definition resolved)' };
var CONSENT = ['unknown', 'not-required', 'requested', 'granted', 'refused'];
var AMENDMENT = ['none', 'requested', 'drafted', 'signed'];
var EQUIPMENT_END = ['host', 'owner', 'removed'];
var SURVEY = ['open', 'scheduled', 'done'];
/* where the compute's power comes from: spare capacity on the service that
   is there (service less the measured peak), a new service on the utility's
   will-serve, or an interconnection that is already approved */
var POWER_PATHS = ['existing-service', 'new-service', 'interconnection'];
/* the recorded values an exclusion rule may name */
var MATCH_FIELDS = ['hostType', 'locationType', 'tags', 'chargers.use', 'intakeType'];
var ACTIONS = ['decide', 'stage', 'gate', 'control', 'offtake', 'chargers', 'profile', 'survey'];
/* the system's own change, never a person's request: the Grid Atlas screen landing (grid-screen.js) */
var SYSTEM_ACTIONS = ['screen'];
var HISTORY_CAP = 200, NOTE_MIN = 5;

/* ── small validators: each throws an Error carrying .status ───────────── */
function fail(status, message) { var e = new Error(message); e.status = status; return e; }
function has(v) { return v !== undefined && v !== null && v !== ''; }
function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
function extend(target) {
  for (var i = 1; i < arguments.length; i++) { var src = arguments[i]; if (!src) continue; for (var k in src) if (own(src, k)) target[k] = src[k]; }
  return target;
}
function copy(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
function round(n, dp) { if (n == null || !isFinite(n)) return null; var f = Math.pow(10, dp || 0); return Math.round(n * f) / f; }
function list(xs) { return xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]; }
function text(v, max, label, opts) {
  opts = opts || {};
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string' && typeof v !== 'number') throw fail(400, label + ' must be text');
  var s = String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
  s = (opts.multiline ? s.replace(/\r\n?/g, '\n') : s.replace(/[\r\n\t]+/g, ' ')).trim();
  if (s.length > max) throw fail(400, label + ' is too long (' + max + ' characters at most)');
  if (opts.required && !s) throw fail(400, label + ' is required');
  return s;
}
/* The merge convention of the site CRM: a key the caller did not send
   (undefined) stays as stored; one sent blank (null or '') is cleared. */
function optText(v, max, label, multiline) { if (v === undefined) return undefined; var s = text(v, max, label, { multiline: multiline }); return s || null; }
function num(v, label, min, max) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  var n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  if (!isFinite(n) || n < min || n > max) throw fail(400, label + ' must be a number from ' + min + ' to ' + max);
  return n;
}
function whole(v, label, min, max) { var n = num(v, label, min, max); if (n != null && Math.floor(n) !== n) throw fail(400, label + ' must be a whole number'); return n; }
function bool(v, label) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (v === true || v === 'true' || v === 'yes') return true;
  if (v === false || v === 'false' || v === 'no') return false;
  throw fail(400, label + ' must be yes, no or left unknown');
}
function realDay(s) { var t = Date.parse(s + 'T00:00:00Z'); return isFinite(t) && new Date(t).toISOString().slice(0, 10) === s; }
function day(v, label) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  var s = String(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !realDay(s)) throw fail(400, label + ' must be a date (YYYY-MM-DD)');
  return s;
}
function pick(v, xs, label) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  var s = String(v).trim().toLowerCase();
  if (xs.indexOf(s) < 0) throw fail(400, label + ' must be one of: ' + xs.join(', '));
  return s;
}
function recordId(v, label) {
  var s = String(v == null ? '' : v);
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(s)) throw fail(400, (label || 'Record') + ' id is not valid');
  return s;
}
function optId(v, label) { if (v === undefined) return undefined; return has(v) ? recordId(v, label) : null; }
function texts(v, max, n, label) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return [];
  var arr = Array.isArray(v) ? v : String(v).split(/[,;\n]+/), out = [];
  arr.forEach(function (x) { var t = text(x, max, label); if (t && out.indexOf(t) < 0) out.push(t); });
  if (out.length > n) throw fail(400, 'At most ' + n + ' ' + label.toLowerCase());
  return out;
}
function merge(prev, next) { var out = extend({}, prev || {}); for (var k in next) if (own(next, k) && next[k] !== undefined) out[k] = next[k]; return out; }

/* ── days: ISO YYYY-MM-DD, UTC, no clock ───────────────────────────────── */
function dayOf(iso) { var s = String(iso || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; }
function addMonths(d, months) {
  var y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)) - 1, dd = Number(d.slice(8, 10)), n = Math.round(months);
  var tm = m + n, ty = y + Math.floor(tm / 12); tm = ((tm % 12) + 12) % 12;
  var last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ty, tm, Math.min(dd, last))).toISOString().slice(0, 10);
}
function monthsBetween(a, b) {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7))) + (Number(b.slice(8, 10)) - Number(a.slice(8, 10))) / 31;
}

/* ── the switch and the workspace's own config ─────────────────────────── */
function enabled(billing) { return !!(billing && billing.toolOverrides && billing.toolOverrides[FLAG] === true); }
function cfgKey(v) { var s = String(v == null ? '' : v).trim().toLowerCase(); return /^[a-z0-9][a-z0-9-]{0,39}$/.test(s) ? s : null; }
function cfgText(v, max) { return typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : ''; }
function cfgNum(v, min, max) { var n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN); return isFinite(n) && n >= min && n <= max ? n : null; }
function cfgEntries(raw, what, problems) {
  var out = [];
  if (raw == null) return out;
  if (!Array.isArray(raw)) { problems.push(what + ' must be a list'); return out; }
  raw.forEach(function (e, i) {
    var k = cfgKey(e && e.key), l = cfgText(e && e.label, 80);
    if (!k || !l) { problems.push(what + '[' + i + '] needs a key (a-z, 0-9, -) and a label'); return; }
    if (out.some(function (x) { return x.key === k; })) { problems.push(what + ': ' + k + ' is listed twice'); return; }
    out.push({ key: k, label: l });
  });
  return out;
}
function cfgExclusions(raw, problems) {
  var out = [];
  if (raw == null) return out;
  if (!Array.isArray(raw)) { problems.push('exclusions must be a list'); return out; }
  raw.forEach(function (e, i) {
    var k = cfgKey(e && e.key), l = cfgText(e && e.label, 80), r = cfgText(e && e.reason, 300), match = [];
    if (!k || !l || !r) { problems.push('exclusions[' + i + '] needs a key, a label and a reason'); return; }
    (Array.isArray(e.match) ? e.match : []).forEach(function (m, j) {
      var f = m && MATCH_FIELDS.indexOf(m.field) >= 0 ? m.field : null;
      var vals = (m && Array.isArray(m.in) ? m.in : []).map(function (x) { return cfgText(x, 80).toLowerCase(); }).filter(Boolean);
      if (!f || !vals.length || vals.length > 50) { problems.push('exclusions[' + i + '].match[' + j + '] needs a field (' + MATCH_FIELDS.join(', ') + ') and 1 to 50 values'); return; }
      match.push({ field: f, in: vals });
    });
    if (!match.length || match.length > 10) { problems.push('exclusions[' + i + '] needs 1 to 10 match clauses'); return; }
    out.push({ key: k, label: l, reason: r, match: match });
  });
  return out;
}
function cfgStated(s) {
  if (!s || typeof s !== 'object') return null;
  var rp = Array.isArray(s.returnPct) ? s.returnPct.map(function (x) { return cfgNum(x, 0, 1000); }).filter(function (x) { return x != null; }).slice(0, 2) : [];
  return { by: cfgText(s.by, 80) || null, verified: s.verified === true, termYears: cfgNum(s.termYears, 0, 40), returnPct: rp.length ? rp : null,
    paybackYears: cfgNum(s.paybackYears, 0, 40), cardLeadWeeks: cfgNum(s.cardLeadWeeks, 0, 520),
    order: Array.isArray(s.order) ? s.order.map(function (x) { return cfgText(x, 40); }).filter(Boolean).slice(0, 12) : null, note: cfgText(s.note, 300) || null };
}
/* raw (billing/current.portfolioDiligence) → the config, problems listed;
   a key beginning with _ is a note in a seed file and is never kept */
function readConfig(raw, problems) {
  raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  var off = raw.offtake && typeof raw.offtake === 'object' ? raw.offtake : {}, pt = off.partner && typeof off.partner === 'object' ? off.partner : null;
  var partner = pt && cfgKey(pt.key) && cfgText(pt.name, 80) ? { key: cfgKey(pt.key), name: cfgText(pt.name, 80) } : null;
  if (pt && !partner) problems.push('offtake.partner needs a key and a name');
  var tg = raw.target && typeof raw.target === 'object' ? raw.target : null, target = null;
  if (tg) {
    var lo = cfgNum(tg.minUsd, 0, 1e12), hi = cfgNum(tg.maxUsd, 0, 1e12);
    if (lo == null || hi == null || hi < lo) problems.push('target needs minUsd and maxUsd, max at least min');
    else target = { label: cfgText(tg.label, 80) || 'Target deal', minUsd: lo, maxUsd: hi };
  }
  var term = off.termYears == null ? null : cfgNum(off.termYears, 0.5, 40), fee = off.feePct == null ? null : cfgNum(off.feePct, 0, 100), removal = raw.removalMonths == null ? null : cfgNum(raw.removalMonths, 0, 120);
  if (off.termYears != null && term == null) problems.push('offtake.termYears must be 0.5 to 40');
  if (off.feePct != null && fee == null) problems.push('offtake.feePct must be 0 to 100');
  if (raw.removalMonths != null && removal == null) problems.push('removalMonths must be 0 to 120');
  return { intakeTypes: cfgEntries(raw.intakeTypes, 'intakeTypes', problems), hostDeals: cfgEntries(raw.hostDeals, 'hostDeals', problems),
    exclusions: cfgExclusions(raw.exclusions, problems), offtake: { partner: partner, termYears: term, feePct: fee, stated: cfgStated(off.stated) },
    target: target, removalMonths: removal };
}
/* lenient: what the door reads (a bad entry is dropped and named) */
function normalizeConfig(raw) { var p = [], c = readConfig(raw, p); c.problems = p; return c; }
/* strict: what a seed must pass before it is written */
function validateConfig(raw) { var p = [], c = readConfig(raw, p); if (p.length) throw fail(400, 'The diligence config has problems: ' + p.join('; ')); return c; }
function configOf(billing) { return normalizeConfig(billing && billing[CONFIG_KEY]); }
/* The enable script's one write: the flag on (every other override kept)
   and the seed's keys added where the workspace has none. A key the
   workspace already holds is never overwritten: its config is its own. */
function enablePatch(billing, seed) {
  billing = billing || {};
  var clean = validateConfig(seed), cur = billing[CONFIG_KEY] && typeof billing[CONFIG_KEY] === 'object' ? copy(billing[CONFIG_KEY]) : {}, added = [], kept = [];
  Object.keys(clean).forEach(function (k) { if (cur[k] === undefined) { cur[k] = clean[k]; added.push(k); } else kept.push(k); });
  var overrides = extend({}, billing.toolOverrides || {}), flagWas = overrides[FLAG] === undefined ? null : overrides[FLAG];
  overrides[FLAG] = true;
  return { changed: flagWas !== true || added.length > 0, flagWas: flagWas, toolOverrides: overrides, config: cur, added: added, kept: kept };
}

/* ── exclusions: a config rule matched on a RECORDED value, never a guess ── */
function valuesAt(site, d, field) {
  var v = null;
  if (field === 'hostType') v = site.hostType;
  else if (field === 'locationType') v = site.facts && site.facts.locationType ? site.facts.locationType.value : site.locationType;
  else if (field === 'tags') v = site.tags;
  else if (field === 'chargers.use') v = d.chargers && d.chargers.use;
  else if (field === 'intakeType') v = d.intakeType;
  var arr = Array.isArray(v) ? v : (has(v) ? [v] : []);
  return arr.map(function (x) { return String(x).trim().toLowerCase(); }).filter(Boolean);
}
/* every rule that matches, each with the field and value it matched on and
   the owner's override when there is one */
function exclusionsFor(site, d, cfg) {
  site = site || {}; d = d || {};
  var out = [], over = d.exclusionOverrides || {};
  ((cfg && cfg.exclusions) || []).forEach(function (rule) {
    var hit = null;
    rule.match.forEach(function (m) {
      if (hit) return;
      var vals = valuesAt(site, d, m.field);
      for (var i = 0; i < vals.length; i++) if (m.in.indexOf(vals[i]) >= 0) { hit = { field: m.field, value: vals[i] }; break; }
    });
    if (hit) out.push({ key: rule.key, label: rule.label, reason: rule.reason, field: hit.field, value: hit.value, overridden: own(over, rule.key) ? over[rule.key] : null });
  });
  return out;
}
function activeExclusions(site, d, cfg) { return exclusionsFor(site, d, cfg).filter(function (x) { return !x.overridden; }); }

/* ── the record, the call, the stage ───────────────────────────────────── */
function blankGate() { return { state: 'open', value: {}, source: null, evidenceFileId: null, by: null, at: null }; }
function current(stored) {
  var d = stored && typeof stored === 'object' ? copy(stored) : {};
  d.v = VERSION;
  if (STAGES.indexOf(d.stage) < 0 && d.stage !== PASSED) d.stage = 'brought-in';
  d.gates = d.gates && typeof d.gates === 'object' ? d.gates : {};
  d.exclusionOverrides = d.exclusionOverrides && typeof d.exclusionOverrides === 'object' ? d.exclusionOverrides : {};
  d.history = Array.isArray(d.history) ? d.history : [];
  ['decision', 'passedFrom', 'intakeType', 'hostDeal', 'chargers', 'control', 'offtake', 'survey'].forEach(function (k) { if (d[k] === undefined) d[k] = null; });
  return d;
}
function gateOf(d, k) { var g = d && d.gates && d.gates[k]; return g && GATE_STATES.indexOf(g.state) >= 0 ? extend(blankGate(), g, { value: g.value || {} }) : blankGate(); }
/* A person's call stands unless an exclusion matches that the owner has not
   reversed: then the site is passed by the rule, the person's call kept
   underneath for when the owner reverses it. */
function decisionOf(d, active) {
  if (active && active.length) {
    var m = active[0];
    return { choice: 'pass', reason: m.reason, by: 'rule', at: null, auto: { rule: m.key, label: m.label, field: m.field, value: m.value }, under: d.decision || null };
  }
  return d.decision || null;
}
function stageOf(d, decision) {
  if (decision && decision.choice === 'pass') return PASSED;
  if (d.stage === PASSED) return d.decision && d.decision.choice === 'pass' ? PASSED : 'brought-in';
  return STAGES.indexOf(d.stage) >= 0 ? d.stage : 'brought-in';
}
function event(ctx, what, from, to, note, extra) {
  return extend({ at: ctx.now, by: ctx.by || null, what: what, from: from === undefined ? null : from, to: to === undefined ? null : to, note: note || null }, extra || {});
}
/* A gate's state as it stands: a confirmation whose document has left the
   site's Files is no longer confirmed by a document on file. Checked when
   the caller hands the Files over (one site's record); a list trusts the
   stored state. */
function evidenceGone(g, files) {
  if (!Array.isArray(files) || g.state !== 'confirmed') return null;
  var ids = [g.evidenceFileId].concat(g.value && g.value.amendmentFileId ? [g.value.amendmentFileId] : []).filter(Boolean), gone = [];
  ids.forEach(function (id) { var f = files.filter(function (x) { return x && x.id === id; })[0]; if (!f || f.archived === true || (f.uploadState && f.uploadState !== 'stored')) gone.push(id); });
  return gone.length ? gone : null;
}
function effState(d, k, ctx) { var g = gateOf(d, k); return evidenceGone(g, ctx && ctx.files) ? 'working' : g.state; }

/* What a forward move to `stage` needs; null when it is earned. */
function requirement(stage, d, ctx) {
  ctx = ctx || {};
  var off = d.offtake || {};
  if (stage === 'brought-in') return null;
  if (stage === 'screened') {
    var still = SCREEN_GATES.filter(function (k) { return gateOf(d, k).state === 'open'; });
    return still.length ? 'Screen ' + list(still.map(function (k) { return GATE_LABEL[k].toLowerCase(); })) + ' first' : null;
  }
  if (stage === 'pursue') return d.decision && d.decision.choice === 'pursue' ? null : 'Earmarking is the call: earmark the site to take it under control';
  if (stage === 'loi-sent') return off.loiStatus === 'sent' || off.loiStatus === 'signed' ? null : 'Record the LOI as sent first';
  if (stage === 'offtake') {
    if (!(off.offtaker && off.offtaker.name)) return 'Name the offtaker first';
    return off.status === 'term-sheet' || off.status === 'executed' ? null : 'The offtake needs agreed terms (a term sheet) first';
  }
  if (stage === 'msa') return effState(d, 'offtake', ctx) === 'confirmed' ? null : 'Confirm the offtake with the signed contract on the site’s Files first';
  if (stage === 'confirmed') {
    var econ = ctx.economics || economicsOf(ctx.site || {}, ctx.kase || null);
    var notYet = GATES.filter(function (k) { return k === 'economics' ? economicsGate(econ, d, ctx).state !== 'confirmed' : effState(d, k, ctx) !== 'confirmed'; }).map(function (k) { return GATE_LABEL[k].toLowerCase(); });
    if (!(d.survey && d.survey.state === 'done')) notYet.push('the site survey');
    return notYet.length ? 'Not confirmed yet: ' + list(notYet) + ' still to confirm' : null;
  }
  return null;
}

/* ── the eight changes ─────────────────────────────────────────────────── */
function decide(d, input, ctx) {
  var choice = pick(input.choice, ['pursue', 'pass', 'reopen'], 'Decision');
  if (!choice) throw fail(400, 'Decide pursue, pass or reopen');
  var reason = text(input.reason, 500, 'Reason', { multiline: true });
  var active = activeExclusions(ctx.site || {}, d, ctx.config), was = decisionOf(d, active), fromStage = stageOf(d, was);
  var fromChoice = was ? was.choice : null, overrides = [];
  if (choice === 'pass') {
    if (reason.length < NOTE_MIN) throw fail(400, 'Passing on a site needs a reason (' + NOTE_MIN + ' characters or more)');
    if (d.decision && d.decision.choice === 'pass' && d.decision.reason === reason) return null;
    if (d.stage !== PASSED) d.passedFrom = d.stage;
    d.decision = { choice: 'pass', reason: reason, by: ctx.by || null, at: ctx.now };
    d.stage = PASSED;
  } else {
    if (active.length) {
      /* the workspace's own rule passed it: reversing it is said, with a
         reason, and kept with who reversed it (any editor of the workspace;
         2026-10-25, the main session: its one person is a member) */
      if (reason.length < NOTE_MIN) throw fail(400, 'This site is excluded (' + list(active.map(function (x) { return x.label.toLowerCase(); })) + '): reversing an exclusion needs a reason (' + NOTE_MIN + ' characters or more)');
      active.forEach(function (x) { d.exclusionOverrides[x.key] = { by: ctx.by || null, role: ctx.role || null, at: ctx.now, reason: reason, field: x.field, value: x.value }; overrides.push(x.key); });
    }
    if (choice === 'pursue') {
      if (!overrides.length && d.decision && d.decision.choice === 'pursue') return null;
      d.decision = { choice: 'pursue', reason: reason || null, by: ctx.by || null, at: ctx.now };
      if (d.stage === PASSED || STAGES.indexOf(d.stage) < STAGES.indexOf('pursue')) d.stage = 'pursue';
      d.passedFrom = null;
    } else {
      if (!overrides.length && !(d.decision && d.decision.choice === 'pass')) throw fail(409, 'Only a passed site is reopened');
      if (d.decision && d.decision.choice === 'pass') {
        /* a reopened site is looked at again: never further than screened */
        var back = d.passedFrom && STAGES.indexOf(d.passedFrom) >= 0 && STAGES.indexOf(d.passedFrom) <= 1 ? d.passedFrom : (d.passedFrom && STAGES.indexOf(d.passedFrom) > 1 ? 'screened' : 'brought-in');
        d.decision = null; d.stage = back; d.passedFrom = null;
      }
    }
  }
  var to = decisionOf(d, activeExclusions(ctx.site || {}, d, ctx.config));
  return event(ctx, 'decision', { stage: fromStage, choice: fromChoice }, { stage: stageOf(d, to), choice: to ? to.choice : null }, reason || null, overrides.length ? { overrides: overrides } : null);
}
function moveStage(d, input, ctx) {
  var to = pick(input.stage, STAGES, 'Stage');
  if (!to) throw fail(400, 'Which stage?');
  var note = text(input.note, 500, 'Note', { multiline: true });
  var dec = decisionOf(d, activeExclusions(ctx.site || {}, d, ctx.config)), from = stageOf(d, dec);
  if (from === PASSED) throw fail(409, 'This site is passed: reopen it or earmark it first');
  if (to === from) return null;
  var fi = STAGES.indexOf(from), ti = STAGES.indexOf(to), extra = null;
  if (ti > fi) {
    for (var i = fi + 1; i <= ti; i++) { var why = requirement(STAGES[i], d, ctx); if (why) throw fail(409, STAGE_LABEL[STAGES[i]] + ': ' + why); }
  } else {
    if (note.length < NOTE_MIN) throw fail(400, 'Moving a site back needs a note (' + NOTE_MIN + ' characters or more)');
    /* back before Pursue un-pursues it: the stage and the call agree */
    if (ti < STAGES.indexOf('pursue') && d.decision && d.decision.choice === 'pursue') { d.decision = null; extra = { cleared: 'pursue' }; }
  }
  d.stage = to;
  return event(ctx, 'stage', from, to, note || null, extra);
}

var GATE_VALUE = {
  power: function (v) {
    return { path: pick(v.path, POWER_PATHS, 'Power path'), serviceKw: num(v.serviceKw, 'Service capacity (kW)', 0, 1e7), voltage: num(v.voltage, 'Voltage (V)', 0, 1e6),
      amps: num(v.amps, 'Service size (A)', 0, 1e6), phase: pick(v.phase == null ? v.phase : String(v.phase), ['1', '3'], 'Phase'), utility: optText(v.utility, 80, 'Utility'),
      willServeKw: num(v.willServeKw, 'Will-serve (kW)', 0, 1e7) };
  },
  interconnection: function (v) {
    return { utility: optText(v.utility, 80, 'Utility'), kind: pick(v.kind, ['existing-service', 'interconnection-agreement', 'queue', 'none'], 'Interconnection kind'),
      approvedImportKw: num(v.approvedImportKw, 'Approved import (kW)', 0, 1e7), approvedExportKw: num(v.approvedExportKw, 'Approved export (kW)', 0, 1e7),
      queueId: optText(v.queueId, 60, 'Queue position'), studyStatus: pick(v.studyStatus, ['none', 'requested', 'in-study', 'approved', 'withdrawn'], 'Study status'), poi: optText(v.poi, 160, 'Point of interconnection') };
  },
  /* carriers[], symmetric1g and lateralMi are where a Grid Atlas screen will land */
  fiber: function (v) {
    return { carriers: texts(v.carriers, 60, 20, 'Carriers'), symmetric1g: bool(v.symmetric1g, 'Symmetric 1 Gbps'), lateralMi: num(v.lateralMi, 'Lateral (miles)', 0, 500),
      carrier: optText(v.carrier, 60, 'Carrier'), mrcUsd: num(v.mrcUsd, 'Monthly charge ($)', 0, 1e7), nrcUsd: num(v.nrcUsd, 'Build charge ($)', 0, 1e8) };
  },
  control: function (v) { return { amendmentFileId: optId(v.amendmentFileId, 'Amendment document') }; },
  chips: function (v) {
    return { chipset: optText(v.chipset, 60, 'Chipset'), gpus: whole(v.gpus, 'GPUs', 0, 1e6), units: whole(v.units, 'Units', 0, 1e5), supplier: optText(v.supplier, 80, 'Supplier'),
      leadWeeks: num(v.leadWeeks, 'Lead time (weeks)', 0, 520), deliveryDate: day(v.deliveryDate, 'Delivery date') };
  },
  offtake: function () { return {}; }
};
function sourceInput(s) {
  if (s === undefined) return undefined;
  if (s === null || s === '') return null;
  if (typeof s !== 'object' || Array.isArray(s)) throw fail(400, 'A source says what kind it is (' + SOURCE_KINDS.join(', ') + ') and names it');
  var kind = pick(s.kind, SOURCE_KINDS, 'Source kind');
  if (!kind) throw fail(400, 'Say what kind of source this is: ' + SOURCE_KINDS.join(', '));
  var doc = kind === 'document' ? pick(s.doc, Object.keys(DOCS), 'Document') : null;
  if (kind === 'document' && !doc) throw fail(400, 'Say which document it is: ' + Object.keys(DOCS).join(', '));
  var ref = optText(s.ref, 300, 'Source reference') || null;
  /* a page may draw the reference as a link: an address is http(s) or it is not kept */
  if (ref && /^[a-z][a-z0-9+.-]*:/i.test(ref) && !/^https?:\/\//i.test(ref)) throw fail(400, 'A source link must be an http(s) address');
  return { kind: kind, doc: doc, name: text(s.name, 160, 'Source', { required: kind !== 'document' }) || DOCS[doc], ref: ref, asOf: day(s.asOf, 'Source date') || null };
}
function fileCheck(files, id) {
  var f = (Array.isArray(files) ? files : []).filter(function (x) { return x && x.id === id; })[0];
  if (!f) throw fail(409, 'That document is not on this site’s Files');
  if (f.archived === true) throw fail(409, 'That document is archived; confirm with one on file');
  if (f.uploadState && f.uploadState !== 'stored') throw fail(409, 'That document did not finish uploading');
  return f;
}
function docsFor(k, d) { return k === 'control' ? (d.control && d.control.route ? ROUTES[d.control.route].confirmedBy : []) : (CONFIRMED_BY[k] || []); }
function confirmWords(k, d) { return k === 'control' ? ROUTES[d.control.route].words : list(docsFor(k, d).map(function (x) { return DOCS[x].toLowerCase(); })); }
/* the CONFIRMED rule: the document is on the site's Files, it is a kind
   that confirms this gate, and the facts the gate rests on agree with it */
function confirmCheck(k, d, value, src, fileId, ctx) {
  if (k === 'control' && !(d.control && d.control.route)) throw fail(409, 'Choose how the site comes under control first: own, buy, lease or take over the host agreement');
  var docs = docsFor(k, d), words = confirmWords(k, d), what = GATE_LABEL[k].toLowerCase() + (k === 'control' ? ' by ' + ROUTES[d.control.route].noun : '');
  if (!fileId) throw fail(400, 'Confirmed needs the document on the site’s Files: ' + words);
  if (!src || src.kind !== 'document') throw fail(400, 'Say which document confirms ' + what + ': ' + words);
  if (docs.indexOf(src.doc) < 0) throw fail(400, DOCS[src.doc] + ' does not confirm ' + what + ': that is ' + words);
  fileCheck(ctx.files, fileId);
  if (k === 'power' && value.willServeKw == null) throw fail(400, 'Enter the kW the will-serve letter commits to');
  if (k === 'interconnection' && !value.utility) throw fail(400, 'Name the utility');
  if (k === 'fiber' && !value.carrier) throw fail(400, 'Name the carrier on the quote');
  if (k === 'chips' && !value.chipset) throw fail(400, 'Name the chips the allocation is for');
  if (k === 'offtake') {
    var off = d.offtake || {};
    if (!(off.offtaker && off.offtaker.name)) throw fail(409, 'Name the offtaker first');
    if (off.status !== 'executed') throw fail(409, 'The offtake is confirmed once it is executed: set its status to executed');
  }
  if (k === 'control') {
    var c = d.control, r = c.route;
    if (r === 'own' && !(c.own && c.own.entity)) throw fail(400, 'Name the owner entity on the deed');
    if (r === 'lease') {
      var l = c.lease || {}, ag = agreementFor(ctx.agreements, c.agreementId, ['lease']), cp = ag && ag.signed === true && ag.computePermitted != null ? ag.computePermitted : l.computePermitted;
      if (cp !== true) throw fail(409, cp === false ? 'The lease does not permit compute, so it does not put the site under control for compute' : 'Say whether the signed lease permits compute');
    }
    if (r === 'takeover') {
      var t = c.takeover || {};
      if (!value.amendmentFileId) throw fail(400, 'Attach the amendment as well: the host agreement limits use to charging and hands the equipment to the host, so both are amended');
      fileCheck(ctx.files, value.amendmentFileId);
      if (t.consentToAssign !== 'granted' && t.consentToAssign !== 'not-required') throw fail(409, 'The host’s consent to assign is not recorded as granted');
      if (t.amendment !== 'signed' || t.computeStoragePermitted !== true) throw fail(409, 'The amendment permitting compute and storage is not recorded as signed');
      if (t.equipmentAtTermEnd !== 'owner' && t.equipmentAtTermEnd !== 'removed') throw fail(409, 'The amendment must end the hand-over of the equipment to the host at term end: record who keeps it');
    }
  }
}
function setGate(d, input, ctx) {
  var k = pick(input.gate, GATES, 'Gate');
  if (!k) throw fail(400, 'Which gate?');
  if (k === 'economics') throw fail(409, 'Economics follows the case on file: the contract case confirms it, never a state set by hand');
  var state = pick(input.state, GATE_STATES, 'Gate state') || gateOf(d, k).state, prev = gateOf(d, k), v = input.value && typeof input.value === 'object' ? input.value : {};
  var value = merge(prev.value, extend(GATE_VALUE[k](v), { note: optText(v.note, 1000, 'Note', true), reason: optText(v.reason, 500, 'Reason', true) }));
  var src = input.source === undefined ? prev.source : sourceInput(input.source);
  var fileId = input.evidenceFileId === undefined ? prev.evidenceFileId : optId(input.evidenceFileId, 'Document');
  if (state === 'screened' && !(src && (src.kind === 'public' || (k === 'chips' && src.kind === 'model')))) throw fail(400, k === 'chips' ? 'Chosen chips rest on public specs or the sizing: name the source' : 'Screened is public data only: name the public source (a map, a registry, a public record)');
  if (state === 'screened' && k === 'chips' && !value.chipset) throw fail(400, 'Name the chips chosen');
  if (state === 'fails' && !(value.reason && value.reason.length >= NOTE_MIN)) throw fail(400, 'A failing gate needs a reason (' + NOTE_MIN + ' characters or more)');
  if (state === 'confirmed') confirmCheck(k, d, value, src, fileId, ctx);
  else if (fileId && fileId !== prev.evidenceFileId) fileCheck(ctx.files, fileId);
  d.gates[k] = { state: state, value: value, source: src || null, evidenceFileId: fileId || null, by: ctx.by || null, at: ctx.now };
  return event(ctx, 'gate:' + k, prev.state, state, value.reason || value.note || null, fileId ? { evidenceFileId: fileId } : null);
}

var ROUTE_FIELDS = {
  own: function (v) { return { entity: optText(v.entity, 160, 'Owner entity') }; },
  buy: function (v) {
    return { priceUsd: num(v.priceUsd, 'Purchase price ($)', 0, 1e10), depositUsd: num(v.depositUsd, 'Deposit ($)', 0, 1e10), closingDate: day(v.closingDate, 'Closing date'),
      contingencies: optText(v.contingencies, 1000, 'Contingencies', true) };
  },
  lease: function (v) {
    return { rentMonthlyUsd: num(v.rentMonthlyUsd, 'Rent ($ a month)', 0, 1e8), escalatorPct: num(v.escalatorPct, 'Escalator (%/yr)', -10, 25), termYears: num(v.termYears, 'Lease term (years)', 0, 99),
      startDate: day(v.startDate, 'Lease start'), endDate: day(v.endDate, 'Lease end'), renewals: optText(v.renewals, 300, 'Renewal options'),
      computePermitted: bool(v.computePermitted, 'Compute permitted'), storagePermitted: bool(v.storagePermitted, 'Storage permitted') };
  },
  takeover: function (v) {
    return { currentHost: optText(v.currentHost, 160, 'Current host'), endDate: day(v.endDate, 'Host agreement end'), termLeftYears: num(v.termLeftYears, 'Term left (years)', 0, 99),
      termAsOf: day(v.termAsOf, 'Term left as of'), rentMonthlyUsd: num(v.rentMonthlyUsd, 'Rent ($ a month)', 0, 1e8), revenueSharePct: num(v.revenueSharePct, 'Revenue share (%)', 0, 100),
      consentToAssign: pick(v.consentToAssign, CONSENT, 'Consent to assign'), amendment: pick(v.amendment, AMENDMENT, 'Amendment'),
      computeStoragePermitted: bool(v.computeStoragePermitted, 'Compute and storage permitted'), equipmentAtTermEnd: pick(v.equipmentAtTermEnd, EQUIPMENT_END, 'Equipment at term end') };
  }
};
function setControl(d, input, ctx) {
  var prev = d.control || {}, route = input.route === undefined ? prev.route || null : pick(input.route, ROUTE_KEYS, 'Control route');
  var next = { route: route || null, agreementId: input.agreementId === undefined ? prev.agreementId || null : optId(input.agreementId, 'Agreement') };
  if (next.agreementId && Array.isArray(ctx.agreements) && !ctx.agreements.some(function (a) { return a && a.id === next.agreementId; })) throw fail(409, 'That agreement is not on this site');
  ROUTE_KEYS.forEach(function (r) {
    if (input[r] === null) next[r] = null;
    else if (input[r] && typeof input[r] === 'object') next[r] = merge(prev[r], ROUTE_FIELDS[r](input[r]));
    else next[r] = prev[r] || null;
  });
  var l = next.lease;
  if (l && l.startDate && l.endDate && l.endDate <= l.startDate) throw fail(400, 'The lease ends before it starts');
  next.by = ctx.by || null; next.at = ctx.now;
  var demoted = !!(prev.route && route !== prev.route && gateOf(d, 'control').state === 'confirmed');
  if (demoted) d.gates.control = extend(gateOf(d, 'control'), { state: 'working', by: ctx.by || null, at: ctx.now });
  d.control = next;
  return event(ctx, 'control', prev.route || null, route || null, demoted ? 'The route changed: the confirmation was for the old route, so control is back to working' : null);
}

/* the Compute desk's counterparty (compute-desk.js offtakerInput), less the
   price, the term and the status: those are the offtake's own fields */
function offtakerInput(b, prev) {
  if (!b || typeof b !== 'object') throw fail(400, 'The offtaker is the buyer of the compute: name it');
  var key = optText(b.key, 60, 'Offtaker key');
  var n = merge(prev, { key: key === undefined ? undefined : (key ? key.toLowerCase() : null), name: optText(b.name, 160, 'Offtaker'), contact: optText(b.contact, 200, 'Offtaker contact'),
    settlement: pick(b.settlement, ['usd', 'other'], 'Settlement'), rateBasis: optText(b.rateBasis, 200, 'Rate basis'), minimumUnits: num(b.minimumUnits, 'Minimum units', 0, 100000),
    acceptance: optText(b.acceptance, 1000, 'Technical acceptance', true), note: optText(b.note, 2000, 'Note', true) });
  if (!n.name) throw fail(400, 'Name the offtaker (the buyer of the compute)');
  if (!n.settlement) n.settlement = 'usd';
  return n;
}
/* null hands the site back to the workspace's default partner; false says
   this offtake has none (a direct deal) */
function partnerInput(p) {
  if (p === null || p === '') return null;
  if (p === false) return false;
  if (!p || typeof p !== 'object') throw fail(400, 'The partner needs a key and a name');
  var key = cfgKey(p.key), name = text(p.name, 80, 'Partner', { required: true });
  if (!key) throw fail(400, 'The partner key is a-z, 0-9 and -');
  return { key: key, name: name };
}
function setOfftake(d, input, ctx) {
  var prev = d.offtake || {}, o = input || {}, desk = o.offtaker && typeof o.offtaker === 'object' ? o.offtaker : null;
  /* the desk's own field names are taken where the offtake's are not sent */
  var price = o.pricePerGpuHour !== undefined ? o.pricePerGpuHour : desk ? desk.ratePerGpuHour : undefined;
  var term = o.termYears !== undefined ? o.termYears : desk && has(desk.termMonths) && isFinite(Number(desk.termMonths)) ? Number(desk.termMonths) / 12 : undefined;
  var status = o.status !== undefined ? o.status : desk ? desk.status : undefined;
  var next = merge(prev, {
    partner: o.partner === undefined ? undefined : partnerInput(o.partner),
    loiStatus: pick(o.loiStatus, LOI, 'LOI status'),
    offtaker: o.offtaker === undefined ? undefined : (o.offtaker === null ? null : offtakerInput(o.offtaker, prev.offtaker)),
    termYears: num(term, 'Offtake term (years)', 0.5, 40), pricePerGpuHour: num(price, 'Price ($ per GPU-hour)', 0, 100),
    takeOrPayPct: num(o.takeOrPayPct, 'Take-or-pay (%)', 0, 100), feePct: num(o.feePct, 'Partner fee (%)', 0, 100),
    status: pick(status, OFFTAKE_STATUS, 'Offtake status'), startDate: day(o.startDate, 'Offtake start')
  });
  next.by = ctx.by || null; next.at = ctx.now;
  var changed = COMMERCIAL.filter(function (k) { return JSON.stringify(prev[k] == null ? null : prev[k]) !== JSON.stringify(next[k] == null ? null : next[k]); });
  if ((prev.offtaker && prev.offtaker.name) !== (next.offtaker && next.offtaker.name)) changed.push('offtaker');
  /* a confirmed offtake is the contract as signed: a changed term, a
     changed buyer or an offtake no longer executed takes it back to working */
  var unexecuted = prev.status === 'executed' && next.status !== 'executed';
  var demoted = gateOf(d, 'offtake').state === 'confirmed' && (changed.length > 0 || unexecuted);
  if (demoted) d.gates.offtake = extend(gateOf(d, 'offtake'), { state: 'working', by: ctx.by || null, at: ctx.now });
  d.offtake = next;
  return event(ctx, 'offtake', { loiStatus: prev.loiStatus || null, status: prev.status || null }, { loiStatus: next.loiStatus || null, status: next.status || null },
    demoted ? (changed.length ? 'The terms changed (' + changed.join(', ') + ')' : 'The offtake is no longer executed') + ': the confirmation was of the contract as signed, so the offtake is back to working' : null);
}
function peakInput(p, prev, ctx) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw fail(400, 'The measured peak is { kw, source, period }');
  if (/nameplate/i.test(String(p.source || ''))) throw fail(400, 'Nameplate is not a measured peak: the headroom takes what the chargers actually drew (' + PEAK_SOURCES.join(', ') + ')');
  var out = merge(prev, { kw: num(p.kw, 'Measured peak (kW)', 0, 1e6), source: pick(p.source, PEAK_SOURCES, 'Peak source'), period: optText(p.period, 80, 'Peak period'), fileId: optId(p.fileId, 'Document') });
  if (out.kw != null && !out.source) throw fail(400, 'Say where the measured peak comes from: ' + PEAK_SOURCES.join(', '));
  if (out.fileId && out.fileId !== (prev && prev.fileId)) fileCheck(ctx.files, out.fileId);
  return out;
}
function setChargers(d, input, ctx) {
  var prev = d.chargers || {}, c = input || {};
  var next = merge(prev, { count: whole(c.count, 'Charger count', 0, 10000), kw: num(c.kw, 'Charger nameplate (kW)', 0, 1e6), status: pick(c.status, CHARGER_STATUS, 'Charger status'),
    network: optText(c.network, 80, 'Network'), use: pick(c.use, CHARGER_USE, 'Charger use') });
  if (c.peak !== undefined) next.peak = c.peak === null ? null : peakInput(c.peak, prev.peak, ctx);
  d.chargers = next;
  return event(ctx, 'chargers', null, null, null);
}
function cfgPick(v, entries, label) {
  if (v === null || v === '') return null;
  if (!entries.length) throw fail(409, 'No ' + label.toLowerCase() + 's are configured for this workspace');
  var k = String(v).trim().toLowerCase();
  if (!entries.some(function (x) { return x.key === k; })) throw fail(400, label + ' must be one of: ' + entries.map(function (x) { return x.label; }).join(', '));
  return k;
}
function setProfile(d, input, ctx) {
  var cfg = ctx.config || normalizeConfig(null), from = { intakeType: d.intakeType, hostDeal: d.hostDeal };
  if (input.intakeType !== undefined) d.intakeType = cfgPick(input.intakeType, cfg.intakeTypes, 'Intake type');
  if (input.hostDeal !== undefined) d.hostDeal = cfgPick(input.hostDeal, cfg.hostDeals, 'Host deal');
  if (from.intakeType === d.intakeType && from.hostDeal === d.hostDeal) return null;
  return event(ctx, 'profile', from, { intakeType: d.intakeType, hostDeal: d.hostDeal }, null);
}
function setSurvey(d, input, ctx) {
  var prev = d.survey || {};
  var next = merge(prev, { state: pick(input.state, SURVEY, 'Survey'), date: day(input.date, 'Survey date'), fileId: optId(input.fileId, 'Document'), note: optText(input.note, 1000, 'Note', true) });
  if (!next.state) next.state = 'open';
  if (next.state === 'done' && !next.fileId) throw fail(400, 'A survey is done when its report is on the site’s Files');
  if (next.fileId && next.fileId !== prev.fileId) fileCheck(ctx.files, next.fileId);
  next.by = ctx.by || null; next.at = ctx.now;
  d.survey = next;
  return event(ctx, 'survey', prev.state || 'open', next.state, next.note || null);
}

/* ── the Grid Atlas screen lands (grid-screen.js computes it, server-side) ─
   Stored as diligence.screen; it moves a gate to SCREENED only from open
   (or refreshes one it screened before), with a public source, and never
   touches a gate a person has taken further: working, confirmed and fails
   stand. Power on the nearest substation at a usable point; interconnection
   only on a published hosting figure at the point (a utility alone is not
   a screen of it); fiber only on carriers read at the address (a carrier
   hotel or a lateral estimate alone is not). */
function sNum(v, max) { var n = v == null || v === '' ? NaN : Number(v); return isFinite(n) && Math.abs(n) <= (max || 1e9) ? n : null; }
function sStr(v, n) { return v == null ? null : (String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n || 160) || null); }
function cleanScreen(x) {
  var lo = x.located || null, pw = x.power || null, fb = x.fiber || null, ho = x.hosting || null, ut = x.utility || null, src = x.sources || {};
  return { v: 1, at: sStr(x.at, 40), complete: x.complete === true,
    located: lo ? { lat: sNum(lo.lat, 90), lng: sNum(lo.lng, 180), precision: sStr(lo.precision, 20), resolvedAddress: sStr(lo.resolvedAddress, 300), usable: lo.usable === true, approximate: lo.approximate === true, note: sStr(lo.note, 200) } : null,
    power: pw ? { substation: sStr(pw.substation, 120), kv: sNum(pw.kv, 2000), distanceMi: sNum(pw.distanceMi, 1000), owner: sStr(pw.owner, 120) } : null,
    fiber: fb ? { carriers: (Array.isArray(fb.carriers) ? fb.carriers : []).map(function (c) { return sStr(c, 80); }).filter(Boolean).slice(0, 30), carriersRead: fb.carriersRead === true,
      carriersStatus: sStr(fb.carriersStatus, 20), carriersNote: sStr(fb.carriersNote, 200), symmetric1g: fb.symmetric1g === true ? true : fb.symmetric1g === false ? false : null, symmetricCount: sNum(fb.symmetricCount, 100),
      lateralMi: sNum(fb.lateralMi, 1000), lateralTo: sStr(fb.lateralTo, 160), carrierHotel: sStr(fb.carrierHotel, 120), carrierHotelMi: sNum(fb.carrierHotelMi, 1000), verdict: sStr(fb.verdict, 20) } : null,
    hosting: ho ? { coverage: sStr(ho.coverage, 40), loadKw: sNum(ho.loadKw, 1e7), storageKw: sNum(ho.storageKw, 1e7), circuit: sStr(ho.circuit, 80), substation: sStr(ho.substation, 120), kv: sNum(ho.kv, 2000),
      basis: sStr(ho.basis, 160), refreshed: sStr(ho.refreshed, 40), source: sStr(ho.source, 160), note: sStr(ho.note, 300) } : null,
    utility: ut ? { name: sStr(ut.name, 120), key: sStr(ut.key, 40), eiaId: sStr(ut.eiaId, 12), basis: ut.basis === 'territory' ? 'territory' : 'zip' } : null,
    sources: { substations: sStr(src.substations, 160), fcc: sStr(src.fcc, 80), peeringdb: sStr(src.peeringdb, 80), hosting: sStr(src.hosting, 160), utility: sStr(src.utility, 80) },
    notes: (Array.isArray(x.notes) ? x.notes : []).map(function (n) { return sStr(n, 300); }).filter(Boolean).slice(0, 10),
    errors: (Array.isArray(x.errors) ? x.errors : []).map(function (e) { return { source: sStr(e && e.source, 40), message: sStr(e && e.message, 300) }; }).slice(0, 10) };
}
function setScreen(d, input, ctx) {
  if (!input.screen || typeof input.screen !== 'object') throw fail(400, 'No screen to record');
  var sc = cleanScreen(input.screen), usable = !!(sc.located && sc.located.usable), moved = [], asOf = dayOf(sc.at);
  d.screen = sc;
  /* the screen moves a gate from open, and refreshes one it screened itself
     (source.screen); a gate a person screened by hand keeps their source */
  function move(k, ok, name, patch) {
    var g = gateOf(d, k);
    if (!ok || !(g.state === 'open' || (g.state === 'screened' && g.source && g.source.screen === true))) return;
    d.gates[k] = { state: 'screened', value: merge(g.value, patch || {}), source: { kind: 'public', doc: null, name: name, ref: null, asOf: asOf, screen: true }, evidenceFileId: g.evidenceFileId || null, by: ctx.by || null, at: ctx.now };
    if (g.state === 'open') moved.push(k);
  }
  move('power', usable && !!(sc.power && sc.power.substation), 'Grid Atlas: the nearest substation' + (sc.sources.substations ? ' (' + sc.sources.substations + ')' : ''));
  var ic = gateOf(d, 'interconnection').value;
  move('interconnection', usable && !!(sc.hosting && sc.hosting.coverage === 'read'), (sc.hosting && sc.hosting.source) || 'The utility’s hosting capacity map', { utility: ic.utility ? undefined : (sc.utility ? sc.utility.name : undefined) });
  move('fiber', usable && !!(sc.fiber && sc.fiber.carriersRead), 'FCC broadband data' + (sc.sources.peeringdb ? ' and PeeringDB' : ''),
    sc.fiber ? { carriers: sc.fiber.carriers, symmetric1g: sc.fiber.symmetric1g, lateralMi: sc.fiber.lateralMi } : null);
  return event(ctx, 'screen', null, moved, sc.errors.length ? sc.errors.map(function (e) { return e.source + ': ' + e.message; }).join('; ') : null, { moved: moved });
}

/* ONE change to one site's diligence. Pure: the next record and the event,
   which the door writes in one transaction with its omega_audit row; a
   change that changes nothing answers unchanged and nothing is written.
   ctx: { site (the register's normalized site), config (normalizeConfig),
   files (the site's Files: [{ id, uploadState, archived }]), agreements
   (the site's agreements), role, canEdit, by, now }. Every change is any
   editor's (owner, admin or member: the door's edit capability); a viewer
   only reads. No change is held back for an owner or an administrator. */
function change(stored, action, input, ctx) {
  ctx = ctx || {};
  if (!ctx.now) throw fail(500, 'change() is handed now');
  if (ctx.canEdit === false) throw fail(403, 'Your role in this workspace can read the diligence but not change it');
  var d = current(stored), ev;
  input = input && typeof input === 'object' ? input : {};
  if (action === 'decide') ev = decide(d, input, ctx);
  else if (action === 'stage') ev = moveStage(d, input, ctx);
  else if (action === 'gate') ev = setGate(d, input, ctx);
  else if (action === 'control') ev = setControl(d, input, ctx);
  else if (action === 'offtake') ev = setOfftake(d, input, ctx);
  else if (action === 'chargers') ev = setChargers(d, input, ctx);
  else if (action === 'profile') ev = setProfile(d, input, ctx);
  else if (action === 'survey') ev = setSurvey(d, input, ctx);
  else if (action === 'screen') ev = setScreen(d, input, ctx);
  else throw fail(400, 'Unknown diligence action');
  if (!ev) return { diligence: current(stored), event: null, unchanged: true };
  if (!d.createdAt) d.createdAt = ctx.now;
  d.updatedAt = ctx.now; d.updatedBy = ctx.by || null;
  d.history = d.history.concat([ev]).slice(-HISTORY_CAP);
  return { diligence: d, event: ev, unchanged: false };
}

/* ── power: the service less the MEASURED peak, never the nameplate ─────── */
function factNum(site, k) { var f = site.facts && site.facts[k]; return f && f.value != null && isFinite(Number(f.value)) ? Number(f.value) : null; }
function flatNum(site, k) { return has(site[k]) && isFinite(Number(site[k])) ? Number(site[k]) : null; }
function nameplateOf(site, d) {
  var rec = factNum(site, 'installedChargerKw'); if (rec == null) rec = flatNum(site, 'installedKw');
  var c = d.chargers || {}, typed = c.kw != null ? Number(c.kw) : null;
  return { kw: typed != null ? typed : rec, source: typed != null ? 'diligence (chargers)' : rec != null ? 'site record (installed charger nameplate)' : null, recordKw: rec, typedKw: typed };
}
function serviceOf(site, d) {
  var lim = (site.powerEvidence && site.powerEvidence.limits) || {}, ev = [], typed = [];
  ['approvedImport', 'service', 'transformer'].forEach(function (k) { if (lim[k] && lim[k].kw != null && isFinite(Number(lim[k].kw))) ev.push({ kw: Number(lim[k].kw), kind: k, source: 'power evidence (' + k + ')', evidenceFileId: lim[k].evidenceFileId || null }); });
  var pg = gateOf(d, 'power').value;
  if (pg.serviceKw != null) typed.push({ kw: Number(pg.serviceKw), kind: 'service', source: 'diligence (power gate)' });
  if (flatNum(site, 'serviceCapacityKw') != null) typed.push({ kw: flatNum(site, 'serviceCapacityKw'), kind: 'service', source: 'site record (service capacity, as entered)' });
  var all = ev.concat(typed);
  if (!all.length) return null;
  /* the binding documented limit wins; a typed figure stands only without one */
  var pickd = ev.length ? ev.reduce(function (a, b) { return b.kw < a.kw ? b : a; }) : typed[0];
  return extend({}, pickd, { candidates: all, differ: all.some(function (x) { return Math.abs(x.kw - pickd.kw) > Math.max(1, pickd.kw * 0.05); }) });
}
function measuredPeak(site, d) {
  var out = [], notes = [], pe = site.powerEvidence || {}, iv = pe.interval && pe.interval.coverage, cp = d.chargers && d.chargers.peak;
  if (iv && iv.peakKw != null && iv.completeYear) out.push({ kw: Number(iv.peakKw), source: 'interval', label: 'interval data (a full year)' });
  if (cp && cp.kw != null && cp.source) out.push({ kw: Number(cp.kw), source: cp.source, label: PEAK_LABEL[cp.source] + (cp.period ? ', ' + cp.period : ''), fileId: cp.fileId || null });
  if (flatNum(site, 'existingPeakKw') != null) out.push({ kw: flatNum(site, 'existingPeakKw'), source: 'entered', label: PEAK_LABEL.entered });
  if (iv && iv.peakKw != null && !iv.completeYear) out.push({ kw: Number(iv.peakKw), source: 'interval', label: 'interval data (' + round((Number(iv.coverage) || 0) * 100, 1) + '% of a year)', partial: true });
  /* the intake's "reported power" is a peak only once its definition is resolved */
  var rf = site.facts && site.facts.reportedPowerKw, rv = rf ? (rf.value != null && isFinite(Number(rf.value)) ? Number(rf.value) : null) : flatNum(site, 'reportedPeakKw');
  var unresolved = site.peakUnresolved === true || !!(rf && (rf.reviewStatus === 'needs_definition_review' || rf.metricDefinition === 'unresolved_reported_peak_or_active_interval_p95') && rf.reviewStatus !== 'reviewed');
  if (rv != null && !unresolved) out.push({ kw: rv, source: 'reported', label: PEAK_LABEL.reported });
  else if (rv != null) notes.push({ code: 'PEAK_DEFINITION_UNRESOLVED', message: 'The reported power statistic (' + rv + ' kW) is not used: its definition (a peak, or a p95 average over active intervals) is unresolved' });
  return { pick: out[0] || null, candidates: out, notes: notes };
}
/* The service that is there, less what it MEASURED: headroomKw. And what
   the compute can have, by the power path on the power gate: that headroom
   (the default), the utility's will-serve for a new service, or the import
   an interconnection already approves: availableKw. Unknown is null with a
   reason; nothing stands in for a missing figure. */
function headroom(site, d) {
  site = site || {}; d = d || current(null);
  var svc = serviceOf(site, d), pk = measuredPeak(site, d), np = nameplateOf(site, d), flags = pk.notes.slice(), pg = gateOf(d, 'power').value, ic = gateOf(d, 'interconnection').value;
  var c = d.chargers || {}, out = { path: pg.path || 'existing-service', pathSet: !!pg.path, serviceKw: svc ? svc.kw : null, serviceSource: svc ? svc.source : null, peakKw: pk.pick ? pk.pick.kw : null,
    peakSource: pk.pick ? pk.pick.label : null, headroomKw: null, overload: false, nameplateKw: np.kw, nameplateSource: np.source, willServeKw: pg.willServeKw != null ? pg.willServeKw : null,
    approvedImportKw: ic.approvedImportKw != null ? ic.approvedImportKw : null, availableKw: null, availableBasis: null, candidates: pk.candidates, flags: flags };
  if (np.typedKw != null && np.recordKw != null && Math.abs(np.typedKw - np.recordKw) > Math.max(1, np.recordKw * 0.01)) flags.push({ code: 'NAMEPLATE_DIFFERS', message: 'The chargers’ nameplate here (' + np.typedKw + ' kW) differs from the site record (' + np.recordKw + ' kW)' });
  if (c.status === 'dark') flags.push({ code: 'DARK_CHARGERS', message: 'The chargers are dark: a recent peak does not include them; switched back on, their load comes off this headroom' });
  if (svc && svc.differ) flags.push({ code: 'SERVICE_FIGURES_DIFFER', message: 'The service figures on record disagree: ' + svc.candidates.map(function (x) { return x.kw + ' kW (' + x.source + ')'; }).join(', ') });
  (function existingService() {
    if (!svc) { if (out.path === 'existing-service') flags.push({ code: 'NO_SERVICE', message: 'No service capacity on record: the headroom is unknown' }); out.reason = 'NO_SERVICE'; return; }
    if (!pk.pick) {
      if (out.path === 'existing-service') flags.push({ code: 'NO_MEASURED_PEAK', message: 'No measured peak: the headroom is unknown' + (np.kw != null ? ' (the ' + np.kw + ' kW nameplate is never subtracted in its place)' : '') });
      out.reason = 'NO_MEASURED_PEAK'; return;
    }
    if (pk.pick.partial) flags.push({ code: 'PEAK_PARTIAL', message: 'The peak is from ' + pk.pick.label + ': a higher peak may be missing' });
    var spread = pk.candidates.filter(function (x) { return Math.abs(x.kw - pk.pick.kw) > Math.max(1, pk.pick.kw * 0.10); });
    if (spread.length) flags.push({ code: 'PEAK_SOURCES_DIFFER', message: 'Measured peaks disagree by more than 10%: ' + pk.candidates.map(function (x) { return x.kw + ' kW (' + x.label + ')'; }).join(', ') });
    /* the register's own headroom contract does the arithmetic (power.js) */
    var hr = P.headroom({ required: ['service'], limits: { service: { kw: svc.kw } }, baselineKw: pk.pick.kw, commitments: [], reserveKw: 0 });
    out.headroomKw = hr.availableKw; out.overload = hr.overload === true; out.rawKw = hr.rawKw;
    if (out.overload) flags.push({ code: 'OVERLOAD', message: 'The measured peak (' + pk.pick.kw + ' kW) is above the service capacity (' + svc.kw + ' kW)' });
  })();
  if (out.path === 'new-service') {
    out.availableKw = out.willServeKw; out.availableBasis = 'the utility’s will-serve for a new service';
    if (out.availableKw == null) flags.push({ code: 'NO_WILL_SERVE', message: 'A new service, and no will-serve figure yet: the power available is unknown' });
  } else if (out.path === 'interconnection') {
    out.availableKw = out.approvedImportKw; out.availableBasis = 'the interconnection’s approved import';
    if (out.availableKw == null) flags.push({ code: 'NO_APPROVED_IMPORT', message: 'An interconnection, and no approved import figure yet: the power available is unknown' });
  } else if (out.headroomKw != null) { out.availableKw = out.headroomKw; out.availableBasis = 'the service less its measured peak'; }
  return out;
}

/* ── control: the paper, and whether it outlasts the offtake ───────────── */
function agreementFor(agreements, id, types) {
  var xs = Array.isArray(agreements) ? agreements.filter(Boolean) : [];
  if (id) { var a = xs.filter(function (x) { return x.id === id; })[0]; if (a) return a; }
  var of = xs.filter(function (x) { return types.indexOf(x.type) >= 0; });
  return of.filter(function (x) { return x.signed === true; })[0] || of[0] || null;
}
function offtakeOf(d, cfg) {
  var o = extend({}, (d && d.offtake) || {}), def = (cfg && cfg.offtake) || {}, defaulted = [];
  if (o.partner == null && def.partner) { o.partner = def.partner; defaulted.push('partner'); }
  if (o.termYears == null && def.termYears != null) { o.termYears = def.termYears; defaulted.push('termYears'); }
  if (o.feePct == null && def.feePct != null) { o.feePct = def.feePct; defaulted.push('feePct'); }
  if (!o.loiStatus) o.loiStatus = 'none';
  if (!o.status) o.status = 'none';
  o.defaulted = defaulted; o.stated = def.stated || null;
  return o;
}
function closedBuy(d) { var g = gateOf(d, 'control'); return g.state === 'confirmed' && g.source && g.source.doc === 'deed'; }
function controlTerm(site, d, ctx) {
  ctx = ctx || {}; site = site || {};
  var c = d.control || {}, route = c.route || null, cfg = ctx.config || normalizeConfig(null), today = dayOf(ctx.now), flags = [];
  var off = offtakeOf(d, cfg), removal = cfg.removalMonths, termYears = off.termYears;
  var base = { route: route, routeLabel: route ? ROUTES[route].label : null, termYears: termYears, removalMonths: removal, perpetual: false, end: null, endBasis: null, required: null, start: null, startBasis: null, ok: null, shortMonths: 0, flags: flags };
  if (!route) return extend(base, { reason: 'NO_ROUTE' });
  if (route === 'own') return extend(base, { perpetual: true, ok: true });
  if (route === 'buy') { if (!closedBuy(d)) flags.push({ code: 'NOT_CLOSED', message: 'Under contract to buy: control is the purchase agreement’s until the deed is on file' }); return extend(base, { perpetual: true, ok: true }); }
  var end = null, basis = null, t;
  if (route === 'lease') {
    var l = c.lease || {}, ag = agreementFor(ctx.agreements, c.agreementId, ['lease']);
    if (ag && ag.signed === true && ag.endDate) { end = ag.endDate; basis = 'the signed lease'; if (l.endDate && l.endDate !== ag.endDate) flags.push({ code: 'TERMS_DIFFER', message: 'The typed lease end (' + l.endDate + ') differs from the signed lease (' + ag.endDate + '); the signed lease is used' }); }
    else if (l.endDate) { end = l.endDate; basis = 'the lease end as entered'; }
    else if (l.termYears != null && l.startDate) { end = addMonths(l.startDate, l.termYears * 12); basis = 'the lease start plus its term'; }
    else if (l.termYears != null && today) { end = addMonths(today, l.termYears * 12); basis = 'today plus the lease term (no start date)'; flags.push({ code: 'TERM_FROM_TODAY', message: 'The lease has no start date: its term is counted from today' }); }
    if (l.renewals) flags.push({ code: 'RENEWALS_NOT_COUNTED', message: 'Renewal options (' + l.renewals + ') are not counted until exercised' });
    var cp = ag && ag.signed === true && ag.computePermitted != null ? ag.computePermitted : l.computePermitted;
    if (cp === false) flags.push({ code: 'LEASE_FORBIDS_COMPUTE', message: 'The lease does not permit compute' });
    else if (cp == null) flags.push({ code: 'LEASE_COMPUTE_UNKNOWN', message: 'Whether the lease permits compute is not recorded' });
  }
  if (route === 'takeover') {
    t = c.takeover || {};
    var host = agreementFor(ctx.agreements, c.agreementId, ['site_host_agreement']), snap = site.facts && site.facts.shaRemainingYears;
    if (host && host.signed === true && host.endDate) { end = host.endDate; basis = 'the signed host agreement'; if (t.endDate && t.endDate !== host.endDate) flags.push({ code: 'TERMS_DIFFER', message: 'The typed end (' + t.endDate + ') differs from the host agreement (' + host.endDate + '); the agreement is used' }); }
    else if (t.endDate) { end = t.endDate; basis = 'the host agreement end as entered'; }
    else if (t.termLeftYears != null && (t.termAsOf || today)) { end = addMonths(t.termAsOf || today, t.termLeftYears * 12); basis = 'the term left as of ' + (t.termAsOf || 'today'); }
    else if (snap && snap.value != null && isFinite(Number(snap.value))) {
      var asOf = dayOf(snap.importedAt) || today;
      if (asOf) { end = addMonths(asOf, Number(snap.value) * 12); basis = 'the reported remaining term as of ' + (dayOf(snap.importedAt) || 'today'); flags.push({ code: 'TERM_FROM_SNAPSHOT', message: 'The term is the intake’s reported remaining term (' + snap.value + ' years' + (dayOf(snap.importedAt) ? ' on ' + asOf : ', date unknown, counted from today') + '), not a signed expiration date' }); }
    }
    if (t.consentToAssign !== 'granted' && t.consentToAssign !== 'not-required') flags.push({ code: 'CONSENT_NEEDED', message: 'The host’s consent to assign is ' + (t.consentToAssign || 'unknown') });
    if (!(t.amendment === 'signed' && t.computeStoragePermitted === true)) flags.push({ code: 'HOST_AGREEMENT_CHARGING_ONLY', message: 'Until the amendment is signed the host agreement permits charging only, not compute and storage' });
    if (t.equipmentAtTermEnd !== 'owner' && t.equipmentAtTermEnd !== 'removed') flags.push({ code: 'EQUIPMENT_REVERTS_TO_HOST', message: t.equipmentAtTermEnd === 'host' ? 'The equipment passes to the host at term end until the amendment changes it' : 'Who keeps the equipment at term end is not recorded' });
  }
  if (!end) return extend(base, { reason: 'TERM_UNKNOWN', flags: flags.concat([{ code: 'TERM_UNKNOWN', message: 'When control ends is not recorded' }]) });
  base.end = end; base.endBasis = basis;
  if (termYears == null) return extend(base, { reason: 'NO_OFFTAKE_TERM', flags: flags.concat([{ code: 'NO_OFFTAKE_TERM', message: 'No offtake term, on the site or as the workspace default: the term cannot be checked' }]) });
  var start = off.startDate || today, startBasis = off.startDate ? 'the offtake start' : 'today (the offtake has no start date yet)';
  if (!start) return extend(base, { reason: 'NO_DATE' });
  var required = addMonths(start, termYears * 12 + (removal || 0)), short = monthsBetween(end, required);
  base.start = start; base.startBasis = startBasis; base.required = required;
  if (removal == null) flags.push({ code: 'NO_REMOVAL_WINDOW', message: 'No removal window is set for this workspace: checked against the offtake term alone' });
  if (!off.startDate) flags.push({ code: 'TERM_FROM_TODAY', message: 'The offtake has no start date: its term is counted from today, so the build time before it is not counted' });
  if (short > 1e-9) {
    base.shortMonths = Math.ceil(short - 1e-9); base.ok = false;
    flags.push({ code: 'CONTROL_TERM_SHORT', message: 'Control ends ' + end + ', ' + base.shortMonths + ' month' + (base.shortMonths === 1 ? '' : 's') + ' before the ' + termYears + '-year offtake term' + (removal ? ' plus the ' + removal + '-month removal window' : '') + ' ends (' + required + ')' });
  } else base.ok = true;
  return base;
}

/* ── economics: read off the record that computed it, never recomputed ─── */
/* The contract case (api/_lib/compute-contract.js contractCase, PR #381)
   mapped to what the register and the Diligence tab draw. Its percents are
   percents (53.1), its terms are read off its own echo (output.contract),
   capex is its own total; returns is null until the contract has a price,
   and the ladder (the price slider's rows) and the sizing by chipset come
   through as the server computed them, so the page does no arithmetic. */
function nOf(v) { return v == null || v === '' || !isFinite(Number(v)) ? null : Number(v); }
function economicsFromCase(output, input, at) {
  var o = output || {}, r = o.returns || null, s = o.sizing || {}, inp = input || {}, k = o.contract || inp.contract || {}, cap = o.capex || {};
  var units = nOf(s.units), unitCost = nOf(cap.unitCostUsd != null ? cap.unitCostUsd : inp.unitCostUsd);
  return { source: 'contract-case', label: 'Contract case', priced: o.priced === true && !!r, needs: Array.isArray(o.needs) ? o.needs.slice() : [],
    irrPct: r ? nOf(r.projectIrrPct) : null, irrBasis: 'project IRR over the contract term', equityIrrPct: r ? nOf(r.equityIrrPct) : null,
    roiPct: r ? nOf(r.roiPct) : null, paybackMonths: r ? nOf(r.paybackMonths) : null, multiple: r ? nOf(r.projectMultiple) : null,
    irrWithoutFeePct: r ? nOf(r.irrWithoutFeePct) : null, revenuePerYear: r ? nOf(r.revenuePerYear) : null, partnerFeePerYear: r ? nOf(r.partnerFeePerYear) : null,
    units: units, unitsLabel: 'Omega-Core skids', gpus: nOf(s.gpus), computeKw: nOf(s.itKw),
    chipset: o.chipset ? { key: o.chipset.key || null, name: o.chipset.name || null } : (inp.chipset ? { key: String(inp.chipset), name: null } : null),
    byChipset: Array.isArray(s.byChipset) ? s.byChipset.map(function (x) { return { key: x.key, name: x.name, units: nOf(x.units), gpus: nOf(x.gpus), gpusPerUnit: nOf(x.gpusPerUnit), itKwPerUnit: nOf(x.itKwPerUnit) }; }) : [],
    capexUsd: nOf(cap.total) != null ? nOf(cap.total) : (units != null && unitCost != null ? units * unitCost : null),
    ladder: Array.isArray(o.ladder) ? o.ladder.slice() : null, ladderBasis: o.ladderBasis || null, priceFor: o.priceFor || null, priceForPayback: o.priceForPayback || null,
    notes: o.notes || null, disclaimer: o.disclaimer || null, partner: o.partner ? { name: o.partner.name || null, feePct: nOf(o.partner.feePct) } : null,
    inputs: { termMonths: nOf(k.termMonths), pricePerGpuHour: nOf(k.pricePerGpuHour), takeOrPayPct: nOf(k.takeOrPayPct), feePct: o.partner ? nOf(o.partner.feePct) : (k.partner ? nOf(k.partner.feePct) : null),
      route: (o.site && o.site.route) || (inp.site && inp.site.route) || null },
    at: at || null };
}
function economicsOf(site, kase) {
  site = site || {};
  var dsn = site.latestDesign && site.latestDesign.compute, designKw = dsn && dsn.kwIt > 0 ? Number(dsn.kwIt) : null;
  if (kase && kase.output) { var e = economicsFromCase(kase.output, kase.input, kase.at); if (e.computeKw == null) e.computeKw = designKw; return e; }
  var lm = site.latestModel;
  if (lm && (lm.irr != null || lm.totalProjectCost != null)) {
    return { source: 'compute-model', label: 'Compute model (screening)', irrPct: lm.irr == null ? null : round(lm.irr * 100, 2), irrBasis: 'after-tax IRR over ' + (lm.termYears || 10) + ' years',
      roiPct: lm.moic == null ? null : round((lm.moic - 1) * 100, 1), paybackMonths: lm.paybackYears == null ? null : Math.round(lm.paybackYears * 12), multiple: lm.moic == null ? null : lm.moic,
      units: lm.skid && lm.skid.units != null ? lm.skid.units : (lm.pods == null ? null : lm.pods), unitsLabel: lm.skid ? 'Omega-Core skids' : 'pods', gpus: lm.gpus == null ? null : lm.gpus,
      computeKw: designKw, capexUsd: lm.totalProjectCost == null ? null : lm.totalProjectCost, at: lm.at || null, modelId: lm.modelId || null };
  }
  var lp = site.latestProforma;
  if (lp) {
    return { source: 'pod-proforma', label: 'Pod pro forma (screening)', irrPct: lp.projectIrrDefined && lp.projectIrrAnnual != null ? round(lp.projectIrrAnnual * 100, 2) : null, irrBasis: 'project IRR, 60 months, pre-tax, unlevered',
      roiPct: null, paybackMonths: lp.paybackMonth == null ? null : lp.paybackMonth, multiple: null, units: lp.pods == null ? null : lp.pods, unitsLabel: 'pods', gpus: null,
      computeKw: lp.itKw != null ? lp.itKw : designKw, capexUsd: lp.investorCapital == null ? null : lp.investorCapital, at: lp.at || null, scenarioId: lp.scenarioId || null };
  }
  return { source: null, label: 'No economics on file', irrPct: null, irrBasis: null, roiPct: null, paybackMonths: null, multiple: null, units: null, unitsLabel: null, gpus: null, computeKw: designKw, capexUsd: null, at: null };
}
/* The economics gate, never set by hand (2026-10-25, the approved mockup's
   colours): open with nothing on file; SCREENED on screening figures (the
   compute model, the pod case, or a contract case not on the offtake's
   own terms: a screen of the figures, not public data); WORKING when the
   contract case runs on the offtake's own price, term and take-or-pay but
   the offtake or control is not yet confirmed; CONFIRMED only by the
   contract case on the confirmed offtake and control. */
function economicsGate(econ, d, ctx) {
  ctx = ctx || {};
  var g = { key: 'economics', label: GATE_LABEL.economics, derived: true, evidenceFileId: null, by: null, at: econ.at || null,
    value: { source: econ.source, irrPct: econ.irrPct, roiPct: econ.roiPct, paybackMonths: econ.paybackMonths }, source: econ.source ? { kind: 'model', doc: null, name: econ.label, ref: null, asOf: dayOf(econ.at) } : null };
  function as(state, note) { return extend(g, { short: GATE_SHORT.economics, state: state, stateLabel: STATE_LABEL[state], note: note }); }
  if (!econ.source) return as('open', 'No economics on file yet');
  if (econ.source !== 'contract-case') return as('screened', 'Screening figures (' + econ.label + '); the contract case on the offtake’s own terms takes it further');
  if (!econ.priced) return as('screened', econ.ladder && econ.ladder.length ? 'No contract price yet: the price ladder shows the range' : 'No contract price yet');
  var off = offtakeOf(d, ctx.config), inp = econ.inputs || {}, onTerms = [];
  if (off.pricePerGpuHour == null || inp.pricePerGpuHour == null || Math.abs(inp.pricePerGpuHour - off.pricePerGpuHour) > 1e-6) onTerms.push('the contract price');
  if (off.termYears != null && (inp.termMonths == null || Math.round(off.termYears * 12) !== Math.round(inp.termMonths))) onTerms.push('the contract term');
  if (off.takeOrPayPct != null && (inp.takeOrPayPct == null || Math.abs(inp.takeOrPayPct - off.takeOrPayPct) > 1e-6)) onTerms.push('the take-or-pay');
  if (onTerms.length) return as('screened', 'The contract case at ' + (inp.pricePerGpuHour != null ? '$' + inp.pricePerGpuHour + '/GPU-hour' : 'a price') + ', not on ' + list(onTerms) + (off.pricePerGpuHour == null ? ' (none agreed yet)' : ''));
  var missing = [];
  if (effState(d, 'offtake', ctx) !== 'confirmed') missing.push('the offtake is confirmed');
  if (effState(d, 'control', ctx) !== 'confirmed') missing.push('control is confirmed');
  return missing.length ? as('working', 'On the offtake’s own terms; confirmed once ' + list(missing)) : as('confirmed', 'The contract case on the confirmed terms');
}
/* Where an IRR sits against the offtake partner's STATED return band (the
   workspace's config, never a constant; unverified, and said so). */
function bandOf(irrPct, cfg) {
  var st = cfg && cfg.offtake && cfg.offtake.stated, rp = st && st.returnPct;
  if (irrPct == null || !rp || rp.length < 2) return null;
  var lo = Math.min(rp[0], rp[1]), hi = Math.max(rp[0], rp[1]), who = (st.by || (cfg.offtake.partner && cfg.offtake.partner.name) || 'the partner') + '’s';
  var pos = irrPct < lo ? 'below' : irrPct > hi ? 'above' : 'inside';
  return { position: pos, lo: lo, hi: hi, verified: st.verified === true, words: (pos === 'below' ? 'Below ' : pos === 'above' ? 'Above ' : 'Inside ') + who + ' ' + lo + '–' + hi + '% range' + (st.verified === true ? '' : ' (as stated, unverified)') };
}
/* The price slider's rows, each with its band, ready to draw: the server
   computed every figure (the contract case's ladder) */
function ladderOf(econ, cfg) {
  if (!econ || !Array.isArray(econ.ladder)) return null;
  return econ.ladder.map(function (x) {
    var irr = nOf(x.projectIrrPct), b = bandOf(irr, cfg);
    return { price: nOf(x.price), projectIrrPct: irr, paybackMonths: nOf(x.paybackMonths), projectMultiple: nOf(x.projectMultiple), roiPct: nOf(x.roiPct), irrWithoutFeePct: nOf(x.irrWithoutFeePct),
      revenuePerYear: nOf(x.revenuePerYear), partnerFeePerYear: nOf(x.partnerFeePerYear), band: b ? b.position : null, bandWords: b ? b.words : null };
  });
}

/* ── what the pages draw ───────────────────────────────────────────────── */
function label(entries, k) { var e = (entries || []).filter(function (x) { return x.key === k; })[0]; return e ? e.label : null; }
function fmt(n) { return n == null ? null : Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 }); }
function money(n) { if (n == null || !isFinite(n)) return null; var a = Math.abs(n); return (n < 0 ? '-$' : '$') + (a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : String(Math.round(a))); }
function fileName(files, id) { var f = (Array.isArray(files) ? files : []).filter(function (x) { return x && x.id === id; })[0]; return f ? (f.name || null) : null; }
/* One gate as the Diligence card draws it (the approved mockup): one
   sentence of what is known, the line of where it came from, and the one
   thing to do next where there is one ({ key, label, task, moves }: the
   door logs the task and moves the gate to In progress). Every part that
   is not on the record says so. */
function linesOf(v, d, site, cfg, files) {
  var out = {}, sc = d.screen || null, pw = v.power, off = v.offtake, econ = v.economics, partner = off.partner ? off.partner.name : null;
  var util = (gateOf(d, 'interconnection').value.utility) || (sc && sc.utility ? sc.utility.name : null), utilBasis = sc && sc.utility ? sc.utility.basis : null;
  function g(k) { return v.gates[k]; }
  /* power */
  var p = [], ps = [];
  if (pw.path === 'new-service') p.push(pw.willServeKw != null ? 'A new service on a will-serve for ' + fmt(pw.willServeKw) + ' kW' : 'A new service: no will-serve figure yet');
  else if (pw.path === 'interconnection') p.push(pw.approvedImportKw != null ? 'An approved interconnection: ' + fmt(pw.approvedImportKw) + ' kW import' : 'An interconnection: no approved import figure yet');
  else {
    p.push((pw.serviceKw != null ? fmt(pw.serviceKw) + ' kW service' : 'Service capacity not on file') + ', ' + (pw.peakKw != null ? fmt(pw.peakKw) + ' kW peak' : 'no measured peak') +
      (pw.headroomKw != null ? ', so ' + fmt(pw.headroomKw) + ' kW free' : pw.nameplateKw != null && pw.peakKw == null ? ' (the ' + fmt(pw.nameplateKw) + ' kW nameplate is not a peak), so free power is unknown' : ', so free power is unknown'));
  }
  if (sc && sc.power && sc.located && sc.located.usable) p.push((sc.power.kv != null ? fmt(sc.power.kv) + ' kV substation ' : 'substation ') + (sc.power.distanceMi != null ? fmt(sc.power.distanceMi) + ' mi' : '(distance not given)'));
  if (pw.serviceKw != null || pw.peakKw != null) ps.push('Site facts');
  if (sc && sc.power) ps.push('Grid Atlas');
  out.power = { sentence: p.join(' · '), sources: ps.join(' · ') || null, action: null };
  /* interconnection */
  var ix = g('interconnection'), iv = ix.value || {}, i = [], isrc = [], hosting = sc && sc.hosting && sc.hosting.coverage === 'read' ? sc.hosting : null;
  if (ix.state === 'confirmed') i.push((iv.kind === 'interconnection-agreement' ? 'Interconnection agreement' : 'Will-serve') + ' on file' + (iv.approvedImportKw != null ? ': ' + fmt(iv.approvedImportKw) + ' kW import' : '') + (iv.utility ? ' from ' + iv.utility : ''));
  else if (ix.state === 'working') i.push('Will-serve requested' + (iv.studyStatus && iv.studyStatus !== 'none' ? ' · study ' + iv.studyStatus : '') + (iv.utility ? ' · ' + iv.utility : ''));
  else if (ix.state === 'fails') i.push('Fails: ' + (iv.reason || ''));
  else i.push('Will-serve not requested');
  if (hosting && ix.state !== 'confirmed') { i.push((util ? util + ' hosting map: ' : 'Hosting map: ') + (hosting.loadKw != null ? fmt(hosting.loadKw) + ' kW of load hosting' : 'no load figure') + (hosting.circuit ? ' on ' + hosting.circuit : '') + (hosting.substation ? ' (' + hosting.substation + ')' : '')); isrc.push(hosting.source || 'Hosting capacity map'); }
  else if (util && ix.state !== 'confirmed') i.push(utilBasis === 'zip' ? 'utility found from the ZIP: ' + util : util + ' serves the point');
  else if (!util && ix.state === 'open') i.push('utility not found yet');
  if (ix.evidenceFileId) isrc.push(fileName(files, ix.evidenceFileId) || 'document on file');
  out.interconnection = { sentence: i.join(' · '), sources: isrc.join(' · ') || null,
    action: ix.state === 'open' || ix.state === 'screened' ? { key: 'log-will-serve', label: 'Log will-serve request', task: { subject: 'Request a will-serve letter from ' + (util || 'the utility'), evidence: DOCS['will-serve'] }, moves: { gate: 'interconnection', state: 'working' } } : null };
  /* fiber */
  var fg = g('fiber'), fv = fg.value || {}, sf = sc && sc.fiber ? sc.fiber : null, f = [], fs = [];
  var carriers = fv.carriers && fv.carriers.length ? fv.carriers : sf && sf.carriersRead ? sf.carriers : [];
  if (fg.state === 'confirmed') f.push((fv.carrier || 'Carrier') + ' quote on file' + (fv.mrcUsd != null ? ': ' + money(fv.mrcUsd) + ' a month' : '') + (fv.nrcUsd != null ? ', ' + money(fv.nrcUsd) + ' to build' : ''));
  else if (fg.state === 'fails') f.push('Fails: ' + (fv.reason || ''));
  else if (carriers.length) { var symN = sf && sf.carriersRead && sf.symmetricCount != null ? sf.symmetricCount : null; f.push(carriers.length + ' fiber carrier' + (carriers.length === 1 ? '' : 's') + ' serve' + (carriers.length === 1 ? 's' : '') + ' the address' + (symN != null ? ', ' + symN + ' offer' + (symN === 1 ? 's' : '') + ' 1 Gbps symmetric' : fv.symmetric1g === true ? ', 1 Gbps symmetric offered' : fv.symmetric1g === false ? ', no 1 Gbps symmetric' : '')); }
  else if (sf && sf.carriersNote) f.push(sf.carriersNote.charAt(0).toUpperCase() + sf.carriersNote.slice(1));
  else f.push(fg.state === 'working' ? 'Carrier quote requested' : 'Not screened yet');
  if (fg.state === 'working' && carriers.length) f.push('carrier quote requested');
  if (sf && sf.carrierHotelMi != null) f.push('carrier hotel ' + fmt(sf.carrierHotelMi) + ' mi');
  if (sf && sf.lateralMi != null && !carriers.length) f.push('lateral about ' + fmt(sf.lateralMi) + ' mi' + (sf.lateralTo ? ' to ' + sf.lateralTo : ''));
  if (sf && sf.carriersRead) fs.push('FCC broadband data');
  if (sf && sf.carrierHotel) fs.push('PeeringDB');
  if (fg.evidenceFileId) fs.push(fileName(files, fg.evidenceFileId) || 'quote on file');
  else if (fg.state !== 'fails') fs.push('confirm with a carrier quote');
  out.fiber = { sentence: f.join(' · '), sources: fs.join(' · '),
    action: fg.state === 'open' || fg.state === 'screened' ? { key: 'log-carrier-quote', label: 'Log carrier quote request', task: { subject: 'Request a fiber quote' + (carriers.length ? ' from ' + carriers.slice(0, 3).join(', ') : ''), evidence: DOCS['carrier-quote'] }, moves: { gate: 'fiber', state: 'working' } } : null };
  /* site control */
  var c = d.control || {}, t = v.control.term, cg = g('control'), cl = [], cs = [];
  if (!c.route) cl.push('How the site comes under control is not chosen');
  else if (c.route === 'own') cl.push('Owned' + (c.own && c.own.entity ? ' by ' + c.own.entity : ' (owner entity not recorded)'));
  else if (c.route === 'buy') { var b = c.buy || {}; cl.push('Buying' + (b.priceUsd != null ? ' for ' + money(b.priceUsd) : '') + (b.closingDate ? ', closing ' + b.closingDate : '') + (cg.state === 'confirmed' ? (cg.source && cg.source.doc === 'deed' ? ' · closed' : ' · under contract') : '')); if (b.contingencies) cl.push('contingencies: ' + b.contingencies); }
  else if (c.route === 'lease') { var l = c.lease || {}; cl.push('Lease' + (l.rentMonthlyUsd != null ? ': ' + money(l.rentMonthlyUsd) + ' a month' : '') + (l.termYears != null ? ', ' + fmt(l.termYears) + ' years' : '') + (l.computePermitted === true ? ' · compute permitted' : l.computePermitted === false ? ' · compute NOT permitted' : ' · compute not recorded')); }
  else { var tk = c.takeover || {}; cl.push('Taking over ' + (tk.currentHost ? tk.currentHost + '’s' : 'the') + ' host agreement · consent to assign ' + (tk.consentToAssign || 'unknown') + ' · amendment ' + (tk.amendment || 'none')); }
  if (c.route && !t.perpetual && t.end) cl.push(t.ok === false ? 'control ends ' + t.end + ', ' + t.shortMonths + ' months short of the offtake term plus removal' : 'control to ' + t.end);
  if (c.route) cs.push('Agreements');
  if (cg.evidenceFileId) cs.push(fileName(files, cg.evidenceFileId) || 'document on file');
  out.control = { sentence: cl.join(' · '), sources: cs.join(' · ') || null, action: !c.route ? { key: 'control-form', label: 'Choose how to take control' } : null };
  /* chips */
  var hg = g('chips'), hv = hg.value || {}, chipName = hv.chipset || (econ.chipset ? econ.chipset.name || econ.chipset.key : null), gpus = hv.gpus != null ? hv.gpus : econ.gpus;
  var lead = hv.leadWeeks != null ? hv.leadWeeks : null, stated = off.stated && off.stated.cardLeadWeeks != null ? off.stated.cardLeadWeeks : null, h = [], hs = [];
  h.push(chipName ? chipName : 'Chips not chosen');
  if (gpus != null) h.push(fmt(gpus) + ' GPUs');
  h.push(hg.state === 'confirmed' ? 'allocation on file' : hg.state === 'working' ? 'allocation requested' : 'allocation not requested');
  if (lead != null) h.push('~' + fmt(lead) + ' weeks'); else if (stated != null) { h.push('~' + fmt(stated) + ' weeks'); hs.push('Lead time from ' + (off.stated.by || partner || 'the partner') + (off.stated.verified ? '' : ', unverified')); }
  if (hg.evidenceFileId) hs.push(fileName(files, hg.evidenceFileId) || 'allocation on file');
  out.chips = { sentence: h.join(' · '), sources: hs.join(' · ') || null,
    action: hg.state === 'open' || hg.state === 'screened' ? { key: 'log-allocation', label: 'Log allocation request', task: { subject: 'Request an allocation' + (chipName ? ' of ' + chipName : ''), evidence: DOCS['chip-allocation'] }, moves: { gate: 'chips', state: 'working' } } : null };
  /* offtake */
  var o = [], og = g('offtake');
  o.push((partner ? partner + ' LOI ' : 'LOI ') + ({ none: 'not sent', drafted: 'drafted', sent: 'sent', signed: 'signed', declined: 'declined' }[off.loiStatus] || 'not sent'));
  if (off.termYears != null) o.push(fmt(off.termYears) + '-year term');
  if (off.feePct != null && off.partner) o.push(fmt(off.feePct) + '% fee');
  o.push(off.offtaker && off.offtaker.name ? off.offtaker.name + (off.pricePerGpuHour != null ? ' at $' + off.pricePerGpuHour + '/GPU-hour' : ', price pending') : off.pricePerGpuHour != null ? 'offtaker pending, $' + off.pricePerGpuHour + '/GPU-hour' : 'offtaker and price pending');
  if (og.state === 'confirmed') o.push('contract on file');
  out.offtake = { sentence: o.join(' · '), sources: partner || null, action: v.stage === 'pursue' && (off.loiStatus === 'none' || off.loiStatus === 'drafted') && off.partner ? { key: 'loi-package', label: 'Send LOI package' + (partner ? ' to ' + partner : '') } : null };
  /* economics: its block, one line */
  out.economics = { sentence: econ.irrPct != null ? fmt(econ.irrPct) + '% ' + (econ.irrBasis || 'IRR') + (econ.paybackMonths != null ? ' · payback ' + econ.paybackMonths + ' months' : '') : (econ.source === 'contract-case' && !econ.priced ? 'No contract price yet: the ladder shows the range' : 'No economics on file'),
    sources: econ.label || null, action: null };
  return out;
}
/* What the site sizes to by chipset, from the contract case, the chosen one marked */
function sizingOf(v, d) {
  var econ = v.economics, chosen = (gateOf(d, 'chips').value.chipset || (econ.chipset && (econ.chipset.name || econ.chipset.key)) || '').toLowerCase();
  var rows = (econ.byChipset || []).map(function (x) { return { key: x.key, name: x.name, units: x.units, gpus: x.gpus, chosen: !!chosen && (String(x.key || '').toLowerCase() === chosen || String(x.name || '').toLowerCase() === chosen || (econ.chipset && x.key === econ.chipset.key)) }; });
  var free = v.power.availableKw;
  return { availableKw: free, units: econ.units, words: free != null && econ.units != null ? 'Size from power · ' + fmt(free) + ' kW is ' + econ.units + ' ' + (econ.unitsLabel === 'Omega-Core skids' ? 'skid' + (econ.units === 1 ? '' : 's') : 'unit' + (econ.units === 1 ? '' : 's')) : null, byChipset: rows };
}
/* One site, everything the Diligence tab draws. ctx: { config, files?,
   agreements?, kase?, now } */
function view(site, ctx) {
  ctx = ctx || {}; site = site || {};
  var cfg = ctx.config || normalizeConfig(null), d = current(site.diligence), c2 = extend({}, ctx, { config: cfg, site: site });
  var ex = exclusionsFor(site, d, cfg), active = ex.filter(function (x) { return !x.overridden; }), dec = decisionOf(d, active), stage = stageOf(d, dec);
  var econ = economicsOf(site, ctx.kase || null); c2.economics = econ;
  var gates = {}, flags = [];
  GATES.forEach(function (k) {
    if (k === 'economics') { gates[k] = economicsGate(econ, d, c2); return; }
    var g = gateOf(d, k), gone = evidenceGone(g, ctx.files), st = gone ? 'working' : g.state;
    gates[k] = extend({ key: k, label: GATE_LABEL[k], short: GATE_SHORT[k] }, g, { state: st, stateLabel: stateLabel(k, st), storedState: g.state, confirmedBy: docsFor(k, d) });
    if (gone) flags.push({ code: 'EVIDENCE_GONE', gate: k, message: GATE_LABEL[k] + ' was confirmed by a document no longer on the site’s Files' });
    if (st === 'fails') flags.push({ code: 'GATE_FAILS', gate: k, message: GATE_LABEL[k] + ' fails: ' + (g.value.reason || '') });
  });
  var power = headroom(site, d), term = controlTerm(site, d, c2), off = offtakeOf(d, cfg), np = nameplateOf(site, d);
  if (active.length) flags.unshift({ code: 'EXCLUDED', message: 'Passed by the workspace’s exclusions: ' + active.map(function (x) { return x.label + ' (' + x.field + ' is ' + x.value + ')'; }).join('; ') });
  if (off.defaulted.length) flags.push({ code: 'OFFTAKE_DEFAULTS', message: 'Offtake ' + off.defaulted.map(function (k) { return k === 'termYears' ? 'term' : k === 'feePct' ? 'fee' : k; }).join(' and ') + ' from the workspace default' });
  var partnerRec = off.partner && site.partners && site.partners[off.partner.key] ? site.partners[off.partner.key] : null;
  var out = {
    enabled: true, v: VERSION, stage: stage, stageLabel: STAGE_LABEL[stage], storedStage: d.stage, passedFrom: d.passedFrom,
    decision: dec, intakeType: d.intakeType, intakeLabel: label(cfg.intakeTypes, d.intakeType), hostDeal: d.hostDeal, hostDealLabel: label(cfg.hostDeals, d.hostDeal),
    chargers: extend({}, d.chargers || {}, { nameplateKw: np.kw, nameplateSource: np.source }),
    gates: gates, power: power, control: extend({}, d.control || {}, { term: term }), offtake: off, economics: econ, survey: d.survey, screen: d.screen || null,
    ladder: ladderOf(econ, cfg), band: bandOf(econ.irrPct, cfg),
    exclusions: ex, partnerRecord: partnerRec, next: nextStep(stage, d, c2),
    flags: flags.concat(power.flags, term.flags), history: d.history.slice(-50).reverse(), updatedAt: d.updatedAt || null, updatedBy: d.updatedBy || null
  };
  if (d.screen && d.screen.fiber && d.screen.fiber.carriersStatus === 'needs-key') out.flags.push({ code: 'FCC_KEY_MISSING', message: 'Carrier names need the FCC key (FCC_BB_KEY) on this deployment' });
  out.lines = linesOf(out, d, site, cfg, ctx.files);
  out.sizing = sizingOf(out, d);
  return out;
}
function nextStep(stage, d, ctx) {
  if (stage === PASSED) return { stage: null, label: null, requirement: null, ready: false, note: 'Passed: reopen it or earmark it to take it up again' };
  var i = STAGES.indexOf(stage);
  if (i === STAGES.length - 1) return { stage: null, label: null, requirement: null, ready: false, note: 'Confirmed' };
  var to = STAGES[i + 1], why = requirement(to, d, ctx);
  return { stage: to, label: STAGE_LABEL[to], requirement: why, ready: !why };
}
/* One site as a register row: the stage, the call, the seven chips and the
   figures a fast triage reads */
function row(site, ctx) {
  var v = view(site, ctx), g = {};
  GATES.forEach(function (k) { g[k] = v.gates[k].state; });
  var fib = v.gates.fiber.value || {}, chips = v.gates.chips.value || {};
  return { siteId: site.siteId || site.id || null, stage: v.stage, stageLabel: v.stageLabel,
    decision: v.decision ? { choice: v.decision.choice, reason: v.decision.reason, auto: !!v.decision.auto, by: v.decision.by, at: v.decision.at } : null,
    gates: g, intakeType: v.intakeType, hostDeal: v.hostDeal, headroomKw: v.power.headroomKw, availableKw: v.power.availableKw, freeKw: v.power.availableKw, powerPath: v.power.path, peakSource: v.power.peakSource, nameplateKw: v.power.nameplateKw,
    screenedAt: v.screen ? v.screen.at : null, screenComplete: v.screen ? v.screen.complete === true : false,
    carrier: fib.carrier || null, carriers: fib.carriers || [], chipset: chips.chipset || null, route: v.control.route || null, termOk: v.control.term.ok, termShortMonths: v.control.term.shortMonths,
    loiStatus: v.offtake.loiStatus, offtaker: v.offtake.offtaker ? v.offtake.offtaker.name : null, offtakeTermYears: v.offtake.termYears,
    irrPct: v.economics.irrPct, roiPct: v.economics.roiPct, economicsSource: v.economics.source, units: v.economics.units, unitsLabel: v.economics.unitsLabel,
    computeKw: v.economics.computeKw, capexUsd: v.economics.capexUsd, flags: v.flags.map(function (f) { return f.code; }), next: v.next };
}
function pipeline(rows) {
  var all = STAGES.concat([PASSED]), n = {};
  all.forEach(function (s) { n[s] = 0; });
  (rows || []).forEach(function (r) { if (r && own(n, r.stage)) n[r.stage]++; });
  return all.map(function (s) { return { stage: s, label: STAGE_LABEL[s], count: n[s] }; });
}
/* The running total of pursued sites against the workspace's target deal.
   A figure missing on a site is counted as missing, never as zero: each
   sum says how many sites it covers. */
function tally(rows, cfg) {
  var p = (rows || []).filter(function (r) { return r && r.stage !== PASSED && r.decision && r.decision.choice === 'pursue'; });
  var t = { sites: p.length, availableKw: 0, availableKnown: 0, computeKw: 0, computeKnown: 0, units: 0, unitsKnown: 0, unitLabels: [], capexUsd: 0, capexKnown: 0 };
  p.forEach(function (r) {
    if (r.availableKw != null) { t.availableKw += r.availableKw; t.availableKnown++; }
    if (r.computeKw != null) { t.computeKw += r.computeKw; t.computeKnown++; }
    if (r.units != null) { t.units += r.units; t.unitsKnown++; if (r.unitsLabel && t.unitLabels.indexOf(r.unitsLabel) < 0) t.unitLabels.push(r.unitsLabel); }
    if (r.capexUsd != null) { t.capexUsd += r.capexUsd; t.capexKnown++; }
  });
  /* MW is the power the pursued sites have for compute (availableKw); the
     compute placed on their designs is computeMw beside it */
  t.availableMw = round(t.availableKw / 1000, 3); t.computeMw = round(t.computeKw / 1000, 3); t.capexUsd = round(t.capexUsd, 0);
  t.partial = t.capexKnown < t.sites || t.availableKnown < t.sites;
  var tg = cfg && cfg.target;
  t.target = tg ? { label: tg.label, minUsd: tg.minUsd, maxUsd: tg.maxUsd, ofMinPct: tg.minUsd > 0 ? round(t.capexUsd / tg.minUsd * 100, 1) : null, ofMaxPct: tg.maxUsd > 0 ? round(t.capexUsd / tg.maxUsd * 100, 1) : null,
    toMinUsd: Math.max(0, tg.minUsd - t.capexUsd), within: t.capexUsd >= tg.minUsd && t.capexUsd <= tg.maxUsd, over: t.capexUsd > tg.maxUsd } : null;
  return t;
}
/* stage: a stage, 'passed', or 'live' (everything not passed); gate:
   '<gate>:<state>' or 'any:<state>' */
function filterRows(rows, f) {
  f = f || {};
  var st = f.stage ? String(f.stage) : null, gk = null, gs = null;
  if (st && st !== 'live' && st !== PASSED && STAGES.indexOf(st) < 0) throw fail(400, 'Unknown stage ' + st);
  if (f.gate) {
    var parts = String(f.gate).split(':'); gk = parts[0]; gs = parts[1];
    if ((gk !== 'any' && GATES.indexOf(gk) < 0) || GATE_STATES.indexOf(gs) < 0) throw fail(400, 'Filter a gate as gate:state, for example fiber:open or any:fails');
  }
  return (rows || []).filter(function (r) {
    if (st === 'live' && r.stage === PASSED) return false;
    if (st && st !== 'live' && r.stage !== st) return false;
    if (gk === 'any' && !GATES.some(function (k) { return r.gates[k] === gs; })) return false;
    if (gk && gk !== 'any' && r.gates[gk] !== gs) return false;
    return true;
  });
}
/* The vocabulary the pages draw from, so no page keeps its own copy */
function schema(cfg) {
  cfg = cfg || normalizeConfig(null);
  return { flag: FLAG, stages: STAGES.slice(), passed: PASSED, stageLabels: copy(STAGE_LABEL), callLabels: copy(CALL_LABEL), stageHints: copy(STAGE_HINT), gates: GATES.slice(), gateLabels: copy(GATE_LABEL), gateShort: copy(GATE_SHORT), gateStates: GATE_STATES.slice(), stateLabels: copy(STATE_LABEL), gateStateLabels: copy(GATE_STATE_LABEL),
    sourceKinds: SOURCE_KINDS.slice(), docs: copy(DOCS), confirmedBy: copy(CONFIRMED_BY), routes: copy(ROUTES), loi: LOI.slice(), offtakeStatus: OFFTAKE_STATUS.slice(),
    chargerStatus: CHARGER_STATUS.slice(), chargerUse: CHARGER_USE.slice(), peakSources: PEAK_SOURCES.slice(), consent: CONSENT.slice(), amendment: AMENDMENT.slice(),
    equipmentAtTermEnd: EQUIPMENT_END.slice(), survey: SURVEY.slice(), powerPaths: POWER_PATHS.slice(),
    config: { intakeTypes: cfg.intakeTypes, hostDeals: cfg.hostDeals, exclusions: cfg.exclusions.map(function (x) { return { key: x.key, label: x.label, reason: x.reason }; }),
      offtake: cfg.offtake, target: cfg.target, removalMonths: cfg.removalMonths } };
}

module.exports = {
  FLAG: FLAG, CONFIG_KEY: CONFIG_KEY, VERSION: VERSION, STAGES: STAGES, PASSED: PASSED, STAGE_LABEL: STAGE_LABEL, CALL_LABEL: CALL_LABEL, STAGE_HINT: STAGE_HINT, POWER_PATHS: POWER_PATHS, GATES: GATES, GATE_LABEL: GATE_LABEL,
  GATE_STATES: GATE_STATES, STATE_LABEL: STATE_LABEL, GATE_SHORT: GATE_SHORT, GATE_STATE_LABEL: GATE_STATE_LABEL, SYSTEM_ACTIONS: SYSTEM_ACTIONS, SCREEN_GATES: SCREEN_GATES, SOURCE_KINDS: SOURCE_KINDS, DOCS: DOCS, CONFIRMED_BY: CONFIRMED_BY,
  ROUTES: ROUTES, ROUTE_KEYS: ROUTE_KEYS, AGREEMENT_TYPES: AGREEMENT_TYPES, LOI: LOI, OFFTAKE_STATUS: OFFTAKE_STATUS, CHARGER_STATUS: CHARGER_STATUS,
  CHARGER_USE: CHARGER_USE, PEAK_SOURCES: PEAK_SOURCES, CONSENT: CONSENT, AMENDMENT: AMENDMENT, EQUIPMENT_END: EQUIPMENT_END, SURVEY: SURVEY,
  MATCH_FIELDS: MATCH_FIELDS, ACTIONS: ACTIONS, HISTORY_CAP: HISTORY_CAP, NOTE_MIN: NOTE_MIN,
  enabled: enabled, normalizeConfig: normalizeConfig, validateConfig: validateConfig, configOf: configOf, enablePatch: enablePatch,
  exclusionsFor: exclusionsFor, activeExclusions: activeExclusions, current: current, gateOf: gateOf, decisionOf: decisionOf, stageOf: stageOf,
  requirement: requirement, change: change, offtakerInput: offtakerInput, headroom: headroom, measuredPeak: measuredPeak, serviceOf: serviceOf,
  controlTerm: controlTerm, offtakeOf: offtakeOf, economicsOf: economicsOf, economicsFromCase: economicsFromCase, economicsGate: economicsGate,
  view: view, row: row, pipeline: pipeline, tally: tally, filterRows: filterRows, schema: schema, addMonths: addMonths, bandOf: bandOf, ladderOf: ladderOf, cleanScreen: cleanScreen
};
