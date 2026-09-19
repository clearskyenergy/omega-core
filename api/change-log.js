/* GET /api/change-log — who changed what, and when
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

     ?week=2026-W38   an ISO week key; defaults to the week we are in now
     ?back=1          n weeks before that (so the ◀ button is one number)
     ?limit=300       how many individual events to return with the rollup

   Returns { week, range, totals, people[], repos[], days[], events[], gaps }.

   THE ROLLUP IS COMPUTED HERE, NOT IN THE BROWSER. Not because the maths is
   precious — it is counting — but because the browser is a place where the
   answer can be edited before it is read. A number in a report that someone
   reads as a record of who did what has to come off the wire finished.

   WHO MAY READ IT. This is ClearSky's own engineering activity: who pushed,
   who reviewed, who broke a build. It is not tenant data and no tenant ever
   sees it. Staff only — a staff email domain, a `role: staff` claim, an
   omega_staff/{uid} doc, or an address named in CHANGELOG_VIEWERS. The last
   of those exists because the person this was built for signs in on a gmail
   address, and an endpoint that 403s the one person who asked for it is not
   a security boundary, it is a bug with a good excuse. */
'use strict';
var A = require('./_lib/admin');
var C = require('./_lib/changelog');

/* Order matters only for cost: the two free checks run before the read. */
function mayRead(caller) {
  if (caller.staff) return Promise.resolve(true);
  var listed = String(process.env.CHANGELOG_VIEWERS || '')
    .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  if (caller.email && listed.indexOf(String(caller.email).toLowerCase()) >= 0) return Promise.resolve(true);
  return A.db().collection('omega_staff').doc(caller.uid).get()
    .then(function (s) { return s.exists; })
    .catch(function () { return false; });
}

/* What each kind is worth in the summary. A commit and a deploy are both
   "an event", but a week is described by how many commits it holds, not by
   how many rows a database has. */
var COUNTS = {
  commit: 'commits',
  pr_opened: 'prsOpened', pr_merged: 'prsMerged', pr_closed: 'prsClosed',
  review: 'reviews',
  branch_created: 'branches', branch_deleted: 'branches',
  release: 'releases',
  deploy_ready: 'deploys', deploy_promoted: 'deploys',
  deploy_error: 'failures',
  deploy_started: null, deploy_canceled: null,   /* real, counted in events, not headlined */
  project_created: null, project_removed: null, domain_created: null,
  push_truncated: null
};
var BUCKETS = ['commits', 'prsOpened', 'prsMerged', 'prsClosed', 'reviews', 'branches', 'releases', 'deploys', 'failures'];

function blank() {
  var o = { events: 0 };
  BUCKETS.forEach(function (b) { o[b] = 0; });
  return o;
}
function tally(into, kind) {
  into.events++;
  var b = COUNTS[kind];
  if (b) into[b]++;
}

module.exports = A.handler(function (req) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');

  return A.authenticate(req).then(function (caller) {
    return mayRead(caller).then(function (ok) {
      if (!ok) throw A.httpError(403, 'the change log is staff only');

      var q = req.query || {};
      var week = /^\d{4}-W\d{2}$/.test(String(q.week || '')) ? String(q.week) : C.thisWeek();
      var back = Math.max(0, Math.min(520, parseInt(q.back, 10) || 0));
      if (back) week = C.shiftWeek(week, -back);
      var limit = Math.max(1, Math.min(1000, parseInt(q.limit, 10) || 300));

      /* One equality on `week` and an order on `at`. The week key is written
         at record time precisely so this is not a range scan across two
         timestamps — a range query here would need its own composite index
         and would still get the Sunday-night boundary wrong in UTC. */
      return A.db().collection(C.COLLECTION)
        .where('week', '==', week)
        .orderBy('at', 'desc')
        .limit(limit)
        .get()
        .then(function (snap) {
          var events = [], people = {}, repos = {}, days = {}, totals = blank();
          var sawGithub = false, sawVercel = false;

          snap.forEach(function (doc) {
            var d = doc.data();
            tally(totals, d.kind);
            if (d.source === 'github') sawGithub = true;
            if (d.source === 'vercel') sawVercel = true;

            var k = d.actorKey || 'unknown';
            if (!people[k]) {
              people[k] = Object.assign(blank(), {
                key: k,
                name: (d.actor && d.actor.name) || k,
                login: (d.actor && d.actor.login) || null,
                avatar: (d.actor && d.actor.avatar) || null,
                bot: !!(d.actor && d.actor.bot),
                agentEvents: 0,
                where: {},
                lastAt: d.at
              });
            }
            var p = people[k];
            tally(p, d.kind);
            if (d.actor && d.actor.agent) p.agentEvents++;
            if (d.at > p.lastAt) p.lastAt = d.at;
            /* An avatar or a display name only turns up on some events, so
               the first row that carries one wins rather than the last. */
            if (!p.avatar && d.actor && d.actor.avatar) p.avatar = d.actor.avatar;
            if (p.name === k && d.actor && d.actor.name) p.name = d.actor.name;

            var place = d.repo || d.project;
            if (place) {
              p.where[place] = (p.where[place] || 0) + 1;
              if (!repos[place]) repos[place] = Object.assign(blank(), { name: place, source: d.source });
              tally(repos[place], d.kind);
            }
            if (d.day) days[d.day] = (days[d.day] || 0) + 1;

            events.push({
              id: doc.id, source: d.source, kind: d.kind, at: d.at,
              who: (d.actor && d.actor.name) || k,
              login: (d.actor && d.actor.login) || null,
              agent: !!(d.actor && d.actor.agent), bot: !!(d.actor && d.actor.bot),
              where: place || null, target: d.target || null,
              title: d.title || '', url: d.url || null, n: d.n == null ? null : d.n
            });
          });

          var byPerson = Object.keys(people).map(function (k) {
            var p = people[k];
            p.where = Object.keys(p.where).sort(function (a, b) { return p.where[b] - p.where[a]; });
            return p;
          }).sort(function (a, b) { return b.events - a.events || a.name.localeCompare(b.name); });

          var byRepo = Object.keys(repos).map(function (k) { return repos[k]; })
            .sort(function (a, b) { return b.events - a.events; });

          totals.people = byPerson.length;
          totals.places = byRepo.length;

          return {
            week: week,
            range: C.weekRange(week),
            prev: C.shiftWeek(week, -1),
            next: C.shiftWeek(week, 1),
            current: C.thisWeek(),
            zone: C.ZONE,
            totals: totals,
            people: byPerson,
            repos: byRepo,
            days: days,
            events: events,
            truncated: snap.size >= limit,
            /* Said out loud, because an empty column is ambiguous: a week
               with no Vercel rows looks identical whether nothing deployed
               or the webhook was never wired up. */
            gaps: {
              github: !sawGithub,
              vercel: !sawVercel,
              note: 'Vercel webhooks cover deployments, projects and domains. Environment-variable, build-setting and team-membership changes are Audit Log only (Enterprise) and are not recorded here.'
            }
          };
        });
    });
  });
});
