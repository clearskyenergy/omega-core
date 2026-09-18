/* The OSA review inbox is scoped to the reader's own org, and the filter it
   sends has to match the security rules EXACTLY.

   Firestore refuses an entire query the moment one returned document fails the
   rules — it does not trim the result to the allowed rows. So a filter on the
   wrong field, or no filter at all, does not narrow a partner's inbox: it
   empties it, with a permission error in a list nobody reads. That failure
   looks identical to "nothing to adopt", which is why it gets a test rather
   than a comment.

   WHAT THIS TEST DOES AND DOES NOT PROVE. It asserts the SHAPE OF THE QUERY
   the client sends. It runs against a recording stub, not against the rules,
   so it cannot tell you the rules refuse anything.

     intake_projects  read: mineToWork() → canActInOrg(resource.data.orgId).
                      Genuinely enforced; the filter is what makes the query
                      legal.
     projects         read: a six-way disjunction. orgId == userOrg() is one
                      disjunct; isConsoleViewer() is another and is true for
                      any @sunesol.com or @ogisolar.com token regardless of
                      the document. So for this source the filter is a UI
                      narrowing, not a boundary. Pre-existing grant, open
                      decision in MERGE.md.

   A rules-emulator test asserting an @ogisolar.com token is DENIED an
   unfiltered projects read is the thing that would close that gap. This is
   not it.

   fin_projects is deliberately absent for a scoped reader: its read rule turns
   on fin_profiles membership, which a JV partner does not have, so no filter
   makes it readable and asking would only produce an error row. */
'use strict';
const path = require('path');
let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

/* The module is a browser IIFE ending in `})(window)`, so window has to exist
   before it is required, and it needs the two globals it reaches back out to. */
global.window = {
  Portfolio:   { num: function (v) { return v == null ? null : Number(v); },
                 ms: function () { return 0; },
                 esc: function (s) { return String(s); } },
  OmegaAccess: {}
};
require(path.join(__dirname, '..', '..', 'tenants', 'osa', 'ingest-data.js'));
const IN = global.window.Ingest;
ok(!!IN && typeof IN.loadInbox === 'function', 'ingest-data exposes loadInbox');

/* A database that records what was asked of it and returns nothing. */
function recorder() {
  const log = [];
  return { log: log, db: { collection: function (name) {
    const q = { where: function (f, op, v) { q._w = [f, op, v]; return q; },
                get: function () { log.push({ c: name, w: q._w || null });
                                   return Promise.resolve({ forEach: function () {} }); } };
    return q;
  } } };
}

const ORG = 'ogisolar.com';

function run(opts) {
  const r = recorder();
  IN.init(r.db, null);
  return IN.loadInbox(opts).then(function () { return r.log; });
}

Promise.resolve()

/* ClearSky: everything, unfiltered — the behaviour that exists today. */
.then(function () { return run({ sources: ['fin', 'intake', 'editor'] }); })
.then(function (log) {
  ok(log.length === 3, 'unscoped reads all three sources (got ' + log.length + ')');
  ok(log.every(function (q) { return q.w === null; }),
     'unscoped sends no where() — an admin sees the whole inbox');
})

/* A member firm: its own rows, and only from the collections it can read. */
.then(function () { return run({ sources: ['intake', 'editor'], scopeOrg: ORG }); })
.then(function (log) {
  ok(log.length === 2, 'scoped reads intake_projects and projects (got ' + log.length + ')');
  const cols = log.map(function (q) { return q.c; }).sort();
  ok(cols[0] === 'intake_projects' && cols[1] === 'projects', 'and reads exactly those two');
  ok(log.every(function (q) { return q.w && q.w[0] === 'orgId' && q.w[1] === '==' && q.w[2] === ORG; }),
     "every scoped query filters where('orgId','==',org) — the field the rules test");
})

/* Asking for the marketplace as a scoped reader must not produce a query at
   all. A refused read here is not a smaller inbox, it is a broken-looking one. */
.then(function () { return run({ sources: ['fin', 'intake', 'editor'], scopeOrg: ORG }); })
.then(function (log) {
  ok(log.length === 2, 'fin_projects is skipped for a scoped reader, not queried and caught');
  ok(!log.some(function (q) { return q.c === 'fin_projects'; }),
     'and no fin_projects query is ever issued');
})

/* An empty scope is the admin case, not a filter on the empty string — that
   distinction is the difference between "see everything" and "see nothing". */
.then(function () { return run({ sources: ['intake'], scopeOrg: '' }); })
.then(function (log) {
  ok(log.length === 1 && log[0].w === null, "an empty scopeOrg means unscoped, not where('orgId','==','')");
})

.then(function () {
  if (fails) { console.log('tosainboxscope: ' + fails + ' failed'); process.exit(1); }
  console.log('tosainboxscope: all passed');
})['catch'](function (e) {
  console.log('tosainboxscope: threw ' + ((e && e.message) || e));
  process.exit(1);
});
