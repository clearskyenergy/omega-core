/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · the change log — ONE shape for GitHub and for Vercel
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Two providers, two wire formats, one question: who changed what, and when.
   Both receivers (api/hook-github.js, api/hook-vercel.js) translate their
   payload into the row below and hand it to record(). Nothing downstream
   knows or cares which side of the wall an event came from — the weekly
   rollup counts a commit and a deployment with the same code.

   change_log/{id}
     source      'github' | 'vercel'
     kind        commit | branch | pr_opened | pr_merged | review | deploy_ready…
     at          ISO 8601, the moment the PROVIDER says it happened — never
                 the moment we received it. A webhook replayed on Thursday
                 for Monday's push belongs in Monday's week.
     week        'YYYY-Www', computed from `at` in ZONE (below)
     day         'YYYY-MM-DD' in ZONE, so a report can bucket by day
     actorKey    the group-by key: github login, lowercased, else email
     actor       { login, name, email, avatar, bot, agent }
     repo        'owner/name'        (github)
     project     the Vercel project  (vercel)
     target      branch, tag or deployment environment
     title       the human sentence, WRITTEN HERE. The browser renders a
                 string; it never assembles one out of payload fields.
     url         where to go and look at the thing
     n           magnitude — files in a commit, seconds to build, commits on
                 a branch delete. Null where the event has no size.
     recordedAt  server time of the last write. Not a substitute for `at`.

   IDEMPOTENCY. The doc id is derived from the EVENT, not from the delivery:
   a commit is its sha, a review is its review id, a deployment state is the
   deployment id plus the state. GitHub gives a manual redelivery a brand-new
   X-GitHub-Delivery, so keying on the delivery id would have let one click
   in the webhook UI double every number in the week. Keyed on the event, a
   replay overwrites the row it wrote the first time and the counts hold.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto');
var A = require('./admin');

/* The report is read by people who work in Chicago, and mission.html's clock
   is already pinned to it. A week that turns over at UTC midnight puts a
   Sunday evening commit into next week's report, which is exactly the kind
   of quiet wrongness nobody thinks to check. Every bucket below is civil
   time in this zone. */
var ZONE = 'America/Chicago';
var COLLECTION = 'change_log';

/* The instant, as the calendar in Chicago had it: 'YYYY-MM-DD'. en-CA is the
   locale that formats a date in that order, which is why it is used here and
   not for any reason to do with Canada. Intl handles DST, so this stays
   correct across both switchovers without a table of offsets. */
var dayFmt = null;
function localDay(iso) {
  if (!dayFmt) dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  var d = new Date(iso);
  if (isNaN(d)) d = new Date();
  return dayFmt.format(d);
}

/* ISO-8601 week of a civil date. Monday opens the week, and the week that
   holds a Thursday belongs to that Thursday's year — which is why 29 December
   can legitimately be week 01 of the following year. The civil date is walked
   as if it were UTC so the arithmetic never meets a DST offset. */
function weekOfDay(ymd) {
  var p = String(ymd).split('-');
  var t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  var dow = t.getUTCDay() || 7;                    /* Sunday is 7 here, not 0 */
  t.setUTCDate(t.getUTCDate() + 4 - dow);          /* land on this week's Thursday */
  var jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  var wk = Math.ceil(((t - jan1) / 86400000 + 1) / 7);
  return t.getUTCFullYear() + '-W' + (wk < 10 ? '0' + wk : String(wk));
}
function weekOf(iso) { return weekOfDay(localDay(iso)); }

/* The Monday that opens a week key, as a civil date. Used to label a report
   and to step to the week before or after it. */
function mondayOf(weekKey) {
  var m = /^(\d{4})-W(\d{2})$/.exec(String(weekKey || ''));
  if (!m) return null;
  var jan4 = new Date(Date.UTC(+m[1], 0, 4));      /* 4 Jan is always in week 01 */
  var dow = jan4.getUTCDay() || 7;
  var week1Mon = new Date(jan4.getTime() - (dow - 1) * 86400000);
  return new Date(week1Mon.getTime() + (+m[2] - 1) * 7 * 86400000);
}
function ymd(d) {
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
/* n weeks either side of a key. shiftWeek('2026-W38', -1) === '2026-W37',
   and it crosses a year boundary correctly because it does the sum in days
   rather than on the week number. */
function shiftWeek(weekKey, n) {
  var mon = mondayOf(weekKey);
  if (!mon) return null;
  return weekOfDay(ymd(new Date(mon.getTime() + n * 7 * 86400000)));
}
function weekRange(weekKey) {
  var mon = mondayOf(weekKey);
  if (!mon) return null;
  var sun = new Date(mon.getTime() + 6 * 86400000);
  return { week: weekKey, from: ymd(mon), to: ymd(sun) };
}
function thisWeek() { return weekOf(new Date().toISOString()); }

/* ── WHO ─────────────────────────────────────────────────────────────────
   A person is a GitHub login where there is one, because a login is the only
   identifier that survives someone changing the email on their commits. An
   email is the fallback, and 'unknown' is honest rather than a guess.

   `agent` is not `bot`. A bot is an account GitHub marks as one — dependabot,
   an app. An agent is a human account through which something wrote code:
   Claude Code signs its work with a Co-Authored-By trailer, and a week where
   forty commits are that and six are hand-typed is a week whose report
   should be able to say so. Both are recorded; neither is hidden. */
var AGENT_RE = /Co-Authored-By:\s*(Claude|.*\bnoreply@anthropic\.com)/i;

function actorOf(o) {
  o = o || {};
  var login = o.login ? String(o.login) : '';
  var email = o.email ? String(o.email).toLowerCase() : '';
  var key = (login || email || 'unknown').toLowerCase();
  return {
    key: key,
    login: login || null,
    name: o.name || login || email || 'unknown',
    email: email || null,
    avatar: o.avatar || null,
    bot: !!o.bot || /\[bot\]$/i.test(login),
    agent: !!o.agent
  };
}
function looksAgentic(message) { return AGENT_RE.test(String(message || '')); }

/* A readable id that is still guaranteed not to collide. The sanitised key
   is what you read in the console; the eight hex characters are what make
   two keys that sanitise to the same string stay two rows. */
function docId(key) {
  var safe = String(key).replace(/[^A-Za-z0-9_.:@-]+/g, '_').slice(0, 180);
  return safe + '-' + crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 8);
}

/* One row. `key` is the event's own identity (see IDEMPOTENCY above) and is
   never the webhook delivery id. */
function record(ev) {
  var db = A.db(), FV = A.FieldValue();
  var at = ev.at || new Date().toISOString();
  if (isNaN(new Date(at))) at = new Date().toISOString();
  var day = localDay(at);
  var a = actorOf(ev.actor);
  var row = {
    source: ev.source,
    kind: ev.kind,
    at: at,
    day: day,
    week: weekOfDay(day),
    actorKey: a.key,
    actor: a,
    repo: ev.repo || null,
    project: ev.project || null,
    target: ev.target || null,
    title: ev.title || '',
    url: ev.url || null,
    n: (ev.n == null ? null : Number(ev.n)),
    recordedAt: FV.serverTimestamp()
  };
  return db.collection(COLLECTION).doc(docId(ev.key)).set(row).then(function () { return row; });
}

/* Several rows from one delivery — a push carries a commit each. Written in
   one batch so a payload either lands whole or not at all: half a push in
   the log is a week's report that is wrong in a way nobody can see. */
function recordAll(list) {
  if (!list || !list.length) return Promise.resolve([]);
  var db = A.db(), FV = A.FieldValue(), batch = db.batch(), out = [];
  list.slice(0, 400).forEach(function (ev) {
    var at = ev.at || new Date().toISOString();
    if (isNaN(new Date(at))) at = new Date().toISOString();
    var day = localDay(at), a = actorOf(ev.actor);
    var row = {
      source: ev.source, kind: ev.kind, at: at, day: day, week: weekOfDay(day),
      actorKey: a.key, actor: a, repo: ev.repo || null, project: ev.project || null,
      target: ev.target || null, title: ev.title || '', url: ev.url || null,
      n: (ev.n == null ? null : Number(ev.n)), recordedAt: FV.serverTimestamp()
    };
    batch.set(db.collection(COLLECTION).doc(docId(ev.key)), row);
    out.push(row);
  });
  return batch.commit().then(function () { return out; });
}

/* Timing-safe comparison of two signature strings. A plain === leaks, in the
   time it takes to fail, how many leading characters were right — which is
   enough to forge a signature one character at a time. The length check
   first is not a leak: the length of a hex digest is public. */
function safeEqual(a, b) {
  var x = Buffer.from(String(a || ''), 'utf8'), y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

/* Vercel does not parse the body for these endpoints (see each receiver's
   `config` export), so the raw bytes arrive as a stream and the signature is
   checked against exactly what was sent — not against a re-serialisation of
   a parsed object, which would differ in whitespace and key order. */
function rawBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on('data', function (d) { chunks.push(d); });
    req.on('end', function () { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

/* One line, trimmed: a commit subject is the first line of its message, and
   a title that runs to a paragraph breaks every row it lands in. */
function subject(message, max) {
  var s = String(message || '').split('\n')[0].trim();
  max = max || 110;
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

module.exports = {
  COLLECTION: COLLECTION, ZONE: ZONE,
  localDay: localDay, weekOf: weekOf, weekOfDay: weekOfDay, thisWeek: thisWeek,
  shiftWeek: shiftWeek, weekRange: weekRange, mondayOf: mondayOf, ymd: ymd,
  actorOf: actorOf, looksAgentic: looksAgentic, docId: docId,
  record: record, recordAll: recordAll,
  safeEqual: safeEqual, rawBody: rawBody, subject: subject
};
