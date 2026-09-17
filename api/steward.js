/* ═══════════════════════════════════════════════════════════════════════════════
   /api/steward — the steward's brief, where Jarvis can read it
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Vercel serverless function.

   ─────────────────────────────────────────────────────────────────────────────
   WHY THIS EXISTS
   ─────────────────────────────────────────────────────────────────────────────
   The daily pass (scripts/steward/run.js) knows whether the platform is sound:
   whether anything was altered, whether the tests pass, whether every endpoint
   still refuses a stranger, whether the fiber layers are current. That answer
   was going to a GitHub issue, which is the one place nobody looks while they
   are working.

   Jarvis is where the work is tracked, so that is where the answer belongs —
   "is anything broken?" asked in the editor, and the Integrity panel on
   Mission Control, both read this. The brief is written once a day by the
   pass; everything else here reads.

   ─────────────────────────────────────────────────────────────────────────────
   STAFF ONLY, BOTH WAYS
   ─────────────────────────────────────────────────────────────────────────────
   A brief names which endpoints are unauthenticated, which sealed files moved
   and which data layers are stale. That is a map of where to push, and it is
   ClearSky's own operations, not a tenant's. So both verbs are staff-gated, and
   a tenant asking Jarvis about platform health gets nothing from here.

   ─────────────────────────────────────────────────────────────────────────────
   ONE DOCUMENT PER DAY
   ─────────────────────────────────────────────────────────────────────────────
   omega_steward/{YYYY-MM-DD}. A second run on the same day replaces it, so the
   collection is a history at daily resolution and cannot be spammed into one.
   Nothing here deletes: yesterday's brief is how you tell what changed, and
   CLAUDE.md's rule against deleting documents applies to the steward first.

   The stored brief is markdown, capped, and already scrubbed of anything
   key-shaped by scripts/steward/client.js before it is sent. This function
   refuses a payload over the cap rather than truncating it, because half a
   brief that looks whole is worse than a refusal somebody can act on.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';

var A = require('./_lib/admin');

var MAX_BRIEF = 60000;       /* a long brief is ~6 KB; this is room, not a target */
var MAX_FINDINGS = 200;

function today() { return new Date().toISOString().slice(0, 10); }

/* The shape Mission Control and Jarvis both read. Kept small on purpose: a
   dashboard panel needs the verdict and the counts, not the prose. */
function summarise(doc) {
  var d = doc || {};
  return {
    day: d.day || null,
    at: d.at || null,
    blocking: !!d.blocking,
    blockingSections: d.blockingSections || [],
    counts: d.counts || {},
    headline: d.headline || '',
    findings: (d.findings || []).slice(0, 25),
    base: d.base || null,
    by: d.by || null
  };
}

module.exports = A.handler(function (req) {
  return A.authenticate(req).then(function (caller) {
    if (!caller.staff) throw A.httpError(403, 'ClearSky staff only');

    /* ── READ: the latest brief, or a named day ──────────────────────────── */
    if (req.method === 'GET') {
      var want = String((req.query || {}).day || '').trim();
      var col = A.db().collection('omega_steward');
      var q = want
        ? col.doc(want).get().then(function (s) { return s.exists ? [s] : []; })
        : col.orderBy('day', 'desc').limit(1).get().then(function (snap) { return snap.docs; });
      return q.then(function (docs) {
        if (!docs.length) {
          return {
            found: false,
            summary: null,
            /* Not an error. A deployment that has never run the pass is a
               normal state, and the panel should say which it is. */
            note: 'No brief recorded yet. The daily pass files one through POST /api/steward; see scripts/steward/README.md.'
          };
        }
        var d = docs[0].data();
        return { found: true, summary: summarise(d), brief: d.brief || '' };
      });
    }

    /* ── WRITE: the pass filing today's brief ────────────────────────────── */
    if (req.method !== 'POST') throw A.httpError(405, 'GET or POST');

    var body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { throw A.httpError(400, 'body is not JSON'); } }
    body = body || {};

    var brief = String(body.brief || '');
    if (!brief) throw A.httpError(400, 'brief required');
    if (brief.length > MAX_BRIEF) throw A.httpError(413, 'brief is ' + brief.length + ' characters; the cap is ' + MAX_BRIEF);

    var day = /^\d{4}-\d{2}-\d{2}$/.test(String(body.day || '')) ? body.day : today();
    var findings = Array.isArray(body.findings) ? body.findings.slice(0, MAX_FINDINGS) : [];

    var doc = {
      day: day,
      at: new Date().toISOString(),
      by: caller.email || null,
      blocking: !!body.blocking,
      blockingSections: Array.isArray(body.blockingSections) ? body.blockingSections.slice(0, 8) : [],
      headline: String(body.headline || '').slice(0, 300),
      counts: body.counts && typeof body.counts === 'object' ? body.counts : {},
      base: body.base ? String(body.base).slice(0, 200) : null,
      findings: findings.map(function (f) {
        return {
          check: String((f && f.check) || '').slice(0, 40),
          file: String((f && f.file) || '').slice(0, 200),
          detail: String((f && f.detail) || '').slice(0, 400),
          severity: String((f && f.severity) || 'warn').slice(0, 10)
        };
      }),
      brief: brief
    };

    return A.db().collection('omega_steward').doc(day).set(doc).then(function () {
      return { ok: true, day: day, blocking: doc.blocking, findings: doc.findings.length };
    });
  });
});
