#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * /api/parcel-tiles — Regrid's nationwide parcel tiles through our relay,
 * offline. The ticket (one per calendar month, last month's honoured), the
 * POST's refusals (no key, no tile access, switched off, an inactive
 * workspace), the GET's refusals (no key, a bad or stale ticket, a tile off
 * the map or below z15), the edge-cache headers, and that the Regrid token
 * and Regrid's own error text never come back to a browser. fetch and
 * _lib/admin are stood in for the way tparcel.js does it. */
'use strict';
const path = require('path');
const assert = require('node:assert/strict');
let n = 0;
function ok(c, m) { assert.ok(c, m); n++; }
function eq(a, b, m) { assert.deepEqual(a, b, m); n++; }

delete process.env.REGRID_TOKEN;
let AUTH = () => Promise.resolve({ uid: 'u1', email: 'pm@concordenergyusa.com', orgId: 'concordenergyusa.com', staff: false });
let DOCS = {};
function fakeDb() {
  const col = base => ({ doc: id => { const p = base + '/' + id; return { get: () => Promise.resolve({ exists: !!DOCS[p], data: () => DOCS[p] }), collection: c => col(p + '/' + c) }; } });
  return { collection: c => col(c) };
}
const fakeAdmin = {
  handler: fn => fn,
  httpError: (s, m) => { const e = new Error(m); e.status = s; return e; },
  authenticate: req => AUTH(req),
  db: fakeDb,
  billingOf: org => Promise.resolve(DOCS['omega_orgs/' + org + '/billing/current'] || { tier: 'standard' })
};
const libPath = require.resolve(path.join(__dirname, '..', '..', 'api', '_lib', 'admin.js'));
require.cache[libPath] = { id: libPath, filename: libPath, loaded: true, exports: fakeAdmin };
const tiles = require(path.join(__dirname, '..', '..', 'api', 'parcel-tiles.js'));
const H = tiles._helpers;

let CALLS = [], SCRIPT = [];
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
global.fetch = function (url) {
  CALLS.push(String(url));
  const step = SCRIPT.shift() || { png: true };
  if (step.abort) { const e = new Error('aborted'); e.name = 'AbortError'; return Promise.reject(e); }
  const type = step.png ? 'image/png' : 'application/json';
  return Promise.resolve({ ok: !step.status, status: step.status || 200,
    headers: { get: k => (k.toLowerCase() === 'content-type' ? type : null) },
    arrayBuffer: () => Promise.resolve(step.png ? PNG : Buffer.from('{"error":"INTERNAL REGRID SECRET"}')) });
};
function res() {
  return { headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; }, end(b) { this.body = b; return this; } };
}
function get(q) { const r = res(); CALLS = []; return Promise.resolve(tiles({ method: 'GET', query: q, headers: {} }, r)).then(() => r); }
function post() { CALLS = []; return Promise.resolve(tiles({ method: 'POST', headers: {}, body: {} }, res())); }
const ACTIVE = { 'omega_orgs/concordenergyusa.com': { status: 'active' } };

(async function () {
  const NOW = Date.UTC(2026, 9, 3, 12);   /* 2026-10-03 */
  eq(H.monthOf(NOW), '2026-10', 'the month a ticket names');
  eq(H.monthBefore(NOW), '2026-09', 'and the one before');
  eq(H.monthBefore(Date.UTC(2026, 0, 15)), '2025-12', 'across the year');

  /* ── no key: nothing pretends ─────────────────────────────────────── */
  DOCS = Object.assign({}, ACTIVE);
  eq(await post(), { ok: false, reason: 'not-configured' }, 'no REGRID_TOKEN: the POST says not-configured');
  ok(CALLS.length === 0, 'and asks nobody');
  let r = await get({ z: 17, x: 1, y: 1, t: 'x' });
  ok(r.statusCode === 404 && r.headers['cache-control'] === 'no-store' && CALLS.length === 0, 'no REGRID_TOKEN: a tile is a 404, never cached');
  ok(!H.ticketOk('2026-10.anything', NOW), 'and no ticket is valid');

  /* ── a key: the ticket ────────────────────────────────────────────── */
  process.env.REGRID_TOKEN = 'rg_SECRET_TOKEN';
  const T = H.sign('2026-10'), T0 = H.sign('2026-09'), Told = H.sign('2026-08');
  ok(/^2026-10\.[A-Za-z0-9]{20,}$/.test(T), 'a ticket is the month and a signature: ' + T);
  ok(T.indexOf('rg_SECRET') < 0, 'which does not carry the token');
  ok(H.ticketOk(T, NOW) && H.ticketOk(T0, NOW), 'this month\'s and last month\'s are honoured');
  ok(!H.ticketOk(Told, NOW), 'two months back is not');
  ok(!H.ticketOk(T.slice(0, -1) + (T.slice(-1) === 'A' ? 'B' : 'A'), NOW) && !H.ticketOk('2026-10.', NOW) && !H.ticketOk(null, NOW), 'a changed or empty ticket is not');
  process.env.REGRID_TOKEN = 'rg_ROTATED';
  ok(!H.ticketOk(T, NOW), 'rotating REGRID_TOKEN rotates every ticket');
  process.env.REGRID_TOKEN = 'rg_SECRET_TOKEN';

  /* ── POST ─────────────────────────────────────────────────────────── */
  H.resetProbe();
  let out = await post();
  ok(out.ok === true && H.ticketOk(out.ticket, Date.now()) && out.minZoom === 15 && out.source === 'Regrid', 'an active workspace gets this month\'s ticket');
  ok(CALLS.length === 1 && CALLS[0] === 'https://tiles.regrid.com/api/v1/parcels/16/' + H.PROBE.x + '/' + H.PROBE.y + '.png?token=rg_SECRET_TOKEN', 'after one probe tile, with the token, server side');
  ok(JSON.stringify(out).indexOf('rg_SECRET') < 0, 'the answer never carries the token');
  out = await post();
  ok(out.ok && CALLS.length === 0, 'the probe is remembered: the next POST asks nobody');
  H.resetProbe(); SCRIPT = [{ status: 403 }];
  eq(await post(), { ok: false, reason: 'no-tile-access' }, 'a token whose plan has no tiles: no-tile-access, not a map of broken images');
  H.resetProbe(); SCRIPT = [{ png: false }];
  eq(await post(), { ok: false, reason: 'no-tile-access' }, 'an answer that is not a PNG is not tile access either');
  H.resetProbe(); SCRIPT = [{ abort: true }];
  eq(await post(), { ok: false, reason: 'no-tile-access' }, 'a probe that timed out says no for now');
  out = await post();
  ok(out.ok && CALLS.length === 1, 'and is not remembered: the next POST probes again');
  DOCS['omega_orgs/concordenergyusa.com/billing/current'] = { tier: 'standard', toolOverrides: { parcelTiles: false } };
  eq(await post(), { ok: false, reason: 'switched-off' }, 'toolOverrides.parcelTiles === false switches one workspace off');
  delete DOCS['omega_orgs/concordenergyusa.com/billing/current'];
  for (const [label, org] of [['no omega_orgs record', undefined], ['suspended', { status: 'suspended' }]]) {
    DOCS = {}; if (org) DOCS['omega_orgs/concordenergyusa.com'] = org;
    await assert.rejects(post(), e => e.status === 403, label + ': 403'); n++;
  }
  DOCS = Object.assign({}, ACTIVE);
  AUTH = () => Promise.resolve({ uid: 's1', email: 'tom@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true });
  ok((await post()).ok === true, 'staff pass');
  AUTH = () => Promise.reject(Object.assign(new Error('bad token'), { status: 401 }));
  await assert.rejects(post(), e => e.status === 401, 'no ID token: 401'); n++;

  /* ── GET ──────────────────────────────────────────────────────────── */
  const good = H.sign(H.monthOf(Date.now()));
  r = await get({ z: '17', x: '33600', y: '48720', t: good });
  ok(r.statusCode === 200 && r.headers['content-type'] === 'image/png' && Buffer.isBuffer(r.body) && r.body.equals(PNG), 'a valid ticket: the PNG, byte for byte');
  ok(/public/.test(r.headers['cache-control']) && /s-maxage=2592000/.test(r.headers['cache-control']), 'edge-cached for the month: ' + r.headers['cache-control']);
  eq(CALLS, ['https://tiles.regrid.com/api/v1/parcels/17/33600/48720.png?token=rg_SECRET_TOKEN'], 'asked of Regrid with the token, once');
  r = await get({ z: 17, x: 1, y: 1, t: 'nope' });
  ok(r.statusCode === 403 && CALLS.length === 0 && r.headers['cache-control'] === 'no-store', 'a bad ticket: 403, Regrid not asked, not cached');
  r = await get({ z: 17, x: 1, y: 1, t: H.sign('2020-01') });
  ok(r.statusCode === 403 && CALLS.length === 0, 'an old month\'s ticket: 403');
  for (const q of [{ z: 14, x: 1, y: 1 }, { z: 22, x: 1, y: 1 }, { z: 17, x: -1, y: 1 }, { z: 17, x: 131072, y: 1 }, { z: 17, x: 1.5, y: 1 }, { z: 'x', x: 1, y: 1 }]) {
    r = await get(Object.assign({ t: good }, q));
    ok(r.statusCode === 400 && CALLS.length === 0, 'tile ' + JSON.stringify(q) + ': 400, Regrid not asked');
  }
  SCRIPT = [{ status: 500 }];
  r = await get({ z: 17, x: 1, y: 1, t: good });
  ok(r.statusCode === 502 && r.headers['cache-control'] === 'no-store', 'Regrid failed: 502, not cached');
  ok(JSON.stringify(r.body).indexOf('SECRET') < 0 && JSON.stringify(r.body).indexOf('regrid.com') < 0, 'and neither the token, the URL nor Regrid\'s text comes back: ' + JSON.stringify(r.body));
  SCRIPT = [{ png: false }];
  r = await get({ z: 17, x: 1, y: 1, t: good });
  ok(r.statusCode === 502, 'an answer that is not a PNG is not passed on');

  delete process.env.REGRID_TOKEN;
  console.log('parcel tiles: ' + n + ' checks passed.');
})().catch(function (e) { console.error(e); process.exit(1); });
