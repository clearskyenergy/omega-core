/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/events.js — the Event Layer's catalogue and envelope. PURE.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Step one of [[Jarvis as the Company OS]]: usage telemetry from every tenant,
   onto Pub/Sub (topic omega-events), into the twin's twin_events. The vault
   note "Event Layer — Step One Scope" is the design; this file is its
   contract. No I/O here, so every rule below is testable without a network
   (scripts/tests/tevents.js).

   THE TRUST LINE. The browser names the event and its props. It never names
   WHO it is: uid, orgId, tenant host and timestamp are stamped by
   api/events.js from the verified token and the request itself. A client
   that could name its own tenant could forge another tenant's events, and
   this is cross-tenant data.

   THE CATALOGUE IS AN ALLOWLIST. An event not listed is refused, and a prop
   not listed for its event is dropped. Props are flat scalars — except
   tool.run's `inputs`/`outputs`, which carry full raw calculation data by
   decision (2026-09-11) and are the reason for the size cap.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* Must equal TERMS_VERSION in /omega-terms.js (tevents.js asserts it). An
   event is accepted only from a user whose termsAcceptances record carries
   this version — the terms bump gates emission, not just the modal. */
var TERMS_VERSION = '2026-09-23';

var SCHEMA_V = 1;

/* name -> allowed props. `serves` is documentation of WHY it exists; an event
   that serves nothing does not belong here (scope note, "What the events are
   FOR"). `sample:false` = never sampled. */
var CATALOGUE = {
  'session.started':           { props: ['referrer', 'page'], serves: 'gamification, activity' },
  'project.created':           { props: ['projectId', 'vertical', 'source', 'market'], serves: 'all three' },
  'product.selected':          { props: ['projectId', 'productId', 'category', 'qty', 'kwh', 'kw', 'edit'], serves: 'site map math' },
  'tool.opened':               { props: ['toolId', 'projectId'], serves: 'gamification, funnel' },
  'tool.run':                  { props: ['toolId', 'calc', 'durationMs', 'inputHash', 'ok', 'projectId', 'inputs', 'outputs'],
                                 raw: ['inputs', 'outputs'], serves: 'site map math (the important one)' },
  'tool.error':                { props: ['toolId', 'calc', 'message', 'stack'], sample: false, serves: 'site map math' },
  'sitemap.build.completed':   { props: ['projectId', 'parcelFound', 'roadsFound', 'scored', 'durationMs', 'stoppedAt', 'from', 'mode'], serves: 'site map math' },
  'score.computed':            { props: ['projectId', 'score', 'band', 'inputsVersion'], serves: 'site map math' },
  'fin.application.submitted': { props: ['finProjectId', 'amount', 'stage', 'mw', 'tech'], serves: 'financing' },
  'fin.offer.responded':       { props: ['finProjectId', 'offerId', 'outcome'], serves: 'financing' },
  /* Exact counts under sampling: one per device per day, never sampled. */
  'activity.rollup':           { props: ['day', 'counts'], raw: ['counts'], sample: false, serves: 'gamification, funnel' }
};

/* Size. Vercel caps a request body at 4.5MB and Pub/Sub a message at 10MB,
   so a batch is refused past 4MB and one event's raw props are cut past
   RAW_MAX with `truncated: true` on the event — never silently. The twin's
   ingest moves anything over Firestore's 1MB document limit into GCS. */
var BATCH_MAX_BYTES = 4 * 1024 * 1024;
var BATCH_MAX_EVENTS = 50;
var RAW_MAX = 2 * 1024 * 1024;
var STR_MAX = 500;
var STACK_MAX = 4000;

var ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function scalar(v, max) {
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string') return v.length > max ? v.slice(0, max) : v;
  return undefined;                       /* objects/arrays are not scalars */
}

function bytes(v) {
  try { return Buffer.byteLength(JSON.stringify(v), 'utf8'); } catch (e) { return Infinity; }
}

/* One client event -> one clean event, or { error }. Never throws. */
function clean(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'not an object' };
  var name = String(raw.name || '');
  var spec = CATALOGUE[name];
  if (!spec) return { error: 'unknown event ' + name.slice(0, 60) };
  var id = String(raw.id || '');
  if (!ID_RE.test(id)) return { error: 'bad id' };
  var sid = String(raw.sid || '');
  if (!ID_RE.test(sid)) return { error: 'bad session id' };

  var p = raw.props && typeof raw.props === 'object' ? raw.props : {};
  var out = {}, dropped = [], truncated = false;
  Object.keys(p).forEach(function (k) {
    if (spec.props.indexOf(k) < 0) { dropped.push(k); return; }
    if (spec.raw && spec.raw.indexOf(k) >= 0) {
      if (bytes(p[k]) > RAW_MAX) { truncated = true; out[k] = null; return; }
      out[k] = p[k];
      return;
    }
    var s = scalar(p[k], k === 'stack' ? STACK_MAX : STR_MAX);
    if (s === undefined) { dropped.push(k); return; }
    out[k] = s;
  });

  var ev = {
    id: id, sid: sid, name: name, v: SCHEMA_V,
    tool: typeof out.toolId === 'string' ? out.toolId : null,
    clientAt: typeof raw.at === 'number' && isFinite(raw.at) ? raw.at : null,
    props: out
  };
  if (truncated) ev.truncated = true;
  if (dropped.length) ev.dropped = dropped.slice(0, 20);
  return { event: ev };
}

/* The request's own host — never the body's. Origin first (a browser always
   sends it on a cross-origin POST), then the Host header for same-origin. */
function tenantHost(headers) {
  var h = headers || {};
  var o = String(h.origin || '');
  var m = /^https?:\/\/([^/:]+)/i.exec(o);
  if (m) return m[1].toLowerCase();
  return String(h['x-forwarded-host'] || h.host || '').split(':')[0].toLowerCase();
}

/* The Firestore keys that would exclude this caller. One doc per key under
   event_exclusions/: the caller's org, and the host they are working on (the
   OSA JV is `host:osa.clearskyomega.com`, because its members sign in on
   their own domains and never carry orgId 'osa'). */
function exclusionKeys(orgId, host) {
  var k = [];
  if (orgId) k.push(orgId);
  if (host) k.push('host:' + host);
  return k;
}

function stamp(ev, who) {
  ev.uid = who.uid;
  ev.orgId = who.orgId;
  ev.tenant = who.host || null;
  ev.at = who.at;
  ev.staff = !!who.staff;
  return ev;
}

module.exports = {
  TERMS_VERSION: TERMS_VERSION, SCHEMA_V: SCHEMA_V, CATALOGUE: CATALOGUE,
  BATCH_MAX_BYTES: BATCH_MAX_BYTES, BATCH_MAX_EVENTS: BATCH_MAX_EVENTS, RAW_MAX: RAW_MAX,
  clean: clean, tenantHost: tenantHost, exclusionKeys: exclusionKeys, stamp: stamp, bytes: bytes
};
