#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * scripts/check-zoning-measures.js — is every source of the zoning &
 * legislation tracker still there?
 *
 *   node scripts/check-zoning-measures.js            # ask every source link
 *   node scripts/check-zoning-measures.js --state OK
 *
 * data/zoning/measures.json is hand-curated: a record is a reported measure
 * with the link it was read from. Links rot — a county moves its agendas, a
 * legislature archives a session — and a record whose source is gone can no
 * longer be checked by the person relying on it. This asks each link and
 * reports the ones that answer 404 / 410 or do not resolve, so they are
 * re-found or the record is retired by hand. It changes nothing.
 *
 * A 401 / 403 / 429 is a site refusing a script, not a dead page: reported
 * as "refused — open it in a browser", never as dead. It does not read the
 * pages and cannot tell whether a status changed; that is the reviewer's
 * job, and docs/ZONING-LEGISLATION.md says how. The offline shape of the
 * file is held by scripts/tests/tzoningwatch.js (in npm test). */
'use strict';
const fs = require('fs'), path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/zoning/measures.json'), 'utf8'));
const argv = process.argv.slice(2), only = argv.indexOf('--state') >= 0 ? argv[argv.indexOf('--state') + 1] : null;
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; zoning-source-check/1.0)', 'Accept': 'text/html,application/pdf,*/*' };
async function ask(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetch(url, { method, headers: UA, redirect: 'follow', signal: AbortSignal.timeout(25000) });
      if (r.status === 405 || r.status === 501) continue;                 /* no HEAD here: ask with GET */
      if (method === 'HEAD' && r.status >= 400 && r.status !== 404 && r.status !== 410) continue;
      return r.status;
    } catch (e) { if (method === 'GET') return String(e.cause && e.cause.code || e.name || 'error'); }
  }
  return 'error';
}
(async function () {
  const jobs = [];
  for (const r of data.records) if (!only || r.state === only) for (const s of r.sources) jobs.push({ r, s });
  const out = new Array(jobs.length); let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => { for (;;) { const i = next++; if (i >= jobs.length) return; out[i] = await ask(jobs[i].s.url); } }));
  const dead = [], refused = [], odd = [];
  jobs.forEach((j, i) => {
    const st = out[i], line = j.r.id + '  ' + st + '  ' + j.s.url;
    if (st === 404 || st === 410 || st === 'ENOTFOUND') dead.push(line);
    else if (st === 401 || st === 403 || st === 429) refused.push(line);
    else if (typeof st !== 'number' || st >= 400) odd.push(line);
  });
  console.log(jobs.length + ' source link(s) across ' + new Set(jobs.map(j => j.r.id)).size + ' record(s): ' + (jobs.length - dead.length - refused.length - odd.length) + ' answered, '
    + refused.length + ' refused a script, ' + odd.length + ' unclear, ' + dead.length + ' dead.');
  if (dead.length) console.log('\nDEAD — re-find the source or retire the record:\n  ' + dead.join('\n  '));
  if (odd.length) console.log('\nUNCLEAR — try again, then open by hand:\n  ' + odd.join('\n  '));
  if (refused.length) console.log('\nREFUSED A SCRIPT — open in a browser to confirm:\n  ' + refused.join('\n  '));
  process.exitCode = dead.length ? 1 : 0;
})();
