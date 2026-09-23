/* The Event Layer, step one — api/_lib/events.js, api/events.js, omega-events.js.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   What must hold, and why each is a test rather than a hope:
     · identity comes from the token, never the body — a client that could
       name its tenant could forge another tenant's events;
     · nothing is published for a user who has not accepted the CURRENT
       terms, when the layer is off, or when their org or host is excluded —
       and a failed read counts as "no";
     · the client never breaks a page, and run() hands back the work's own
       result or error whatever telemetry does. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

const EV = require(path.join(ROOT, 'api/_lib/events.js'));

/* ── the contract ─────────────────────────────────────────────────────── */
(function () {
  const terms = fs.readFileSync(path.join(ROOT, 'omega-terms.js'), 'utf8');
  const m = /var TERMS_VERSION = '([^']+)'/.exec(terms);
  ok(m && m[1] === EV.TERMS_VERSION, 'api/_lib/events.js TERMS_VERSION equals omega-terms.js (' + (m && m[1]) + ')');
  ok(!/Customer Data solely to provide/.test(terms), 'terms §4 no longer limits Customer Data "solely" to providing the Platform');
  ok(/4a\. Service Data and product improvement/.test(terms) && /may include Customer Data/.test(terms),
     'terms carry §4a and say plainly that Service Data may include Customer Data');
  ok(/4b\. Privacy, retention and sub-processors/.test(terms), 'terms name the sub-processors (§4b)');
  const legal = fs.readFileSync(path.join(ROOT, 'omega-legal-docs.js'), 'utf8');
  ok(!/never identify you, your customers, or your projects/.test(legal),
     'omega-legal-docs.js no longer promises de-identification the pipeline would break');

  const names = Object.keys(EV.CATALOGUE).filter(n => n !== 'activity.rollup');
  ok(names.length === 10, 'ten step-one events in the catalogue (+ the rollup) — got ' + names.length);
})();

(function () {
  const base = { id: 'abcdefgh12', sid: 'sessionid01', at: 1 };
  const c = EV.clean(Object.assign({ name: 'tool.run', props: {
    toolId: 'editor', calc: 'grid-atlas', ok: true, durationMs: 12, inputs: { lat: 1, nested: { a: [1, 2] } },
    uid: 'forged', orgId: 'fenecon.com', junk: 'x' } }, base));
  ok(c.event && c.event.props.inputs.nested.a[1] === 2, 'tool.run keeps full raw inputs (nested)');
  ok(c.event && !('uid' in c.event.props) && !('orgId' in c.event.props) && c.event.dropped.indexOf('orgId') >= 0,
     'a body-supplied uid/orgId is dropped and reported, never kept');
  const s = EV.stamp(c.event, { uid: 'real', orgId: 'concordenergyusa.com', host: 'x.clearskyomega.com', at: 'T', staff: false });
  ok(s.uid === 'real' && s.orgId === 'concordenergyusa.com' && s.tenant === 'x.clearskyomega.com', 'identity is stamped from the verified caller');
  ok(EV.clean(Object.assign({ name: 'user.deleted' }, base)).error, 'an event outside the catalogue is refused');
  ok(EV.clean({ name: 'tool.opened', id: 'x', sid: 'sessionid01' }).error, 'a malformed id is refused');
  const big = EV.clean(Object.assign({ name: 'tool.run', props: { inputs: 'x'.repeat(EV.RAW_MAX + 10) } }, base));
  ok(big.event.truncated === true && big.event.props.inputs === null, 'oversize raw input is cut WITH truncated:true, never silently');
  const nest = EV.clean(Object.assign({ name: 'session.started', props: { referrer: { a: 1 } } }, base));
  ok(!('referrer' in nest.event.props), 'a non-scalar in a scalar prop is dropped');
  ok(EV.tenantHost({ origin: 'https://osa.clearskyomega.com' }) === 'osa.clearskyomega.com', 'tenant host from Origin');
  ok(EV.tenantHost({ host: 'a.clearskyomega.com:443' }) === 'a.clearskyomega.com', 'tenant host from Host when same-origin');
  const k = EV.exclusionKeys('sunesol.com', 'osa.clearskyomega.com');
  ok(k[0] === 'sunesol.com' && k[1] === 'host:osa.clearskyomega.com',
     'exclusion checks the org AND the host — OSA members sign in on their own domains');
})();

/* ── the endpoint's gates, with auth/Firestore/Pub/Sub stubbed ─────────── */
function loadHandler(world) {
  const auth = require(path.join(ROOT, 'api/_lib/verify-token.js'));
  const gcp = require(path.join(ROOT, 'api/_lib/gcp-wif.js'));
  auth.verifyIdToken = () => Promise.resolve({ uid: 'u1', email: 'a@sunesol.com', orgId: 'sunesol.com', staff: false });
  auth.readAsCaller = (tok, p) => { p = decodeURIComponent(p);
    if (world.fail && world.fail.test(p)) return Promise.reject(Object.assign(new Error('x'), { status: 403 }));
    return Promise.resolve(world.docs[p] === undefined ? null : world.docs[p]);
  };
  gcp.configured = () => true;
  gcp.publish = (req, topic, msgs) => { world.published.push.apply(world.published, msgs); return Promise.resolve(msgs.map((_, i) => String(i))); };
  delete require.cache[require.resolve(path.join(ROOT, 'api/events.js'))];
  return require(path.join(ROOT, 'api/events.js'));
}
function call(h, method, body, origin) {
  return new Promise(res => {
    const out = { status: 0, body: null, headers: {} };
    const r = { setHeader(k, v) { out.headers[k] = v; }, status(c) { out.status = c; return r; },
                json(b) { out.body = b; res(out); return r; } };
    h({ method, body, headers: { authorization: 'Bearer t', origin: origin || 'https://sunesol.clearskyomega.com' } }, r);
  });
}
const evt = { id: 'abcdefgh12', sid: 'sessionid01', name: 'tool.opened', props: { toolId: 'editor', orgId: 'fenecon.com' } };
const ON = { 'termsAcceptances/u1': { version: EV.TERMS_VERSION }, 'event_config/current': { enabled: true, sampleRate: 0.25 } };

async function gatesTests() {
  let w = { docs: Object.assign({}, ON), published: [] };
  let h = loadHandler(w);
  let r = await call(h, 'POST', { events: [evt] });
  ok(r.status === 200 && w.published.length === 1, 'accepted and published when terms, config and exclusions all say yes');
  const e = w.published[0] && w.published[0].data;
  ok(e && e.orgId === 'sunesol.com' && e.uid === 'u1' && e.tenant === 'sunesol.clearskyomega.com',
     'the published event carries the TOKEN\'s org, not the body\'s fenecon.com');

  w = { docs: Object.assign({}, ON, { 'termsAcceptances/u1': { version: '2026-08-08' } }), published: [] };
  h = loadHandler(w); r = await call(h, 'POST', { events: [evt] });
  ok(r.status === 202 && r.body.dropped === 'terms' && !w.published.length, 'refused for a user on the OLD terms version');

  w = { docs: Object.assign({}, ON), published: [], fail: /^termsAcceptances/ };
  h = loadHandler(w); r = await call(h, 'POST', { events: [evt] });
  ok(r.status === 202 && !w.published.length, 'a failed terms read is "not accepted" (fail closed)');

  w = { docs: { 'termsAcceptances/u1': { version: EV.TERMS_VERSION } }, published: [] };
  h = loadHandler(w); r = await call(h, 'POST', { events: [evt] });
  ok(r.status === 202 && r.body.dropped === 'off', 'no event_config doc = the layer is OFF');

  w = { docs: Object.assign({}, ON, { 'event_exclusions/sunesol.com': { reason: 'counsel' } }), published: [] };
  h = loadHandler(w); r = await call(h, 'POST', { events: [evt] });
  ok(r.status === 202 && r.body.dropped === 'excluded' && !w.published.length, 'an excluded org publishes nothing');

  w = { docs: Object.assign({}, ON, { 'event_exclusions/host:osa.clearskyomega.com': { reason: 'OSA JV agreement' } }), published: [] };
  h = loadHandler(w); r = await call(h, 'POST', { events: [evt] }, 'https://osa.clearskyomega.com');
  ok(r.status === 202 && r.body.dropped === 'excluded', 'the OSA host is excluded even though the caller\'s org is sunesol.com');

  w = { docs: Object.assign({}, ON, { 'event_exclusions/sunesol.com': { active: false } }), published: [] };
  h = loadHandler(w); r = await call(h, 'POST', { events: [evt] });
  ok(r.status === 200, 'an exclusion marked active:false (counsel cleared it) lets events through');

  w = { docs: Object.assign({}, ON), published: [], fail: /^event_exclusions/ };
  h = loadHandler(w); r = await call(h, 'POST', { events: [evt] });
  ok(r.status === 202 && r.body.dropped === 'excluded', 'a failed exclusion read counts as excluded (fail closed)');

  w = { docs: Object.assign({}, ON), published: [] };
  h = loadHandler(w); r = await call(h, 'GET');
  ok(r.status === 200 && r.body.enabled === true && r.body.sampleRate === 0.25, 'GET hands the client its switch and sample rate');
}

/* ── the client, in a fake browser ─────────────────────────────────────── */
function browser(opts) {
  const store = {}, sess = {}, listeners = {}, posts = [], timers = [];
  const win = {
    location: { pathname: opts.path || '/editor', search: '' },
    crypto: require('crypto').webcrypto,
    addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); },
    firebase: { apps: [1], auth: () => ({ currentUser: { getIdToken: () => Promise.resolve('tok') },
      onAuthStateChanged: f => f({ uid: 'u1' }) }) },
    fetch(url, o) {
      if (!o || !o.method) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.cfg) });
      posts.push(JSON.parse(o.body));
      return Promise.resolve({ ok: true, status: opts.postStatus || 200, json: () => Promise.resolve({}) });
    },
    setTimeout(f) { timers.push(f); return timers.length; }, clearTimeout() {},
    sessionStorage: { getItem: k => (k in sess ? sess[k] : null), setItem: (k, v) => { sess[k] = String(v); }, removeItem: k => { delete sess[k]; } },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { referrer: '', visibilityState: 'visible', addEventListener() {} },
    Promise, JSON, Math, Date, Number, String, Uint8Array, URLSearchParams
  };
  win.window = win; win.firebase.apps.length = 1;
  if (opts.sid) sess['omega-ev-sid'] = opts.sid;
  if (opts.tally) store['omega-ev-tally'] = JSON.stringify(opts.tally);
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'omega-events.js'), 'utf8'), ctx);
  const tick = () => new Promise(r => setImmediate(r));
  return { win, posts, store, listeners, tick,
    flush: async () => { await tick(); await tick(); win.OmegaEvents.flush(); await tick(); await tick(); } };
}
/* a session id whose FNV-1a unit falls below / above a rate */
function sidFor(keep, rate) {
  for (let i = 0; i < 5000; i++) {
    const s = 'sessionid' + i; let h = 2166136261;
    for (let j = 0; j < s.length; j++) { h ^= s.charCodeAt(j); h = Math.imul(h, 16777619) >>> 0; }
    if ((h / 4294967296 < rate) === keep) return s;
  }
}

async function clientTests() {
  let b = browser({ cfg: { enabled: true, sampleRate: 0.25 }, sid: sidFor(true, 0.25) });
  await b.tick(); await b.tick();
  const r = b.win.OmegaEvents.run('editor', 'x', { a: 1 }, () => 42);
  ok(r === 42, 'run() returns the work\'s own result');
  let threw = null;
  try { b.win.OmegaEvents.run('editor', 'x', {}, () => { throw new Error('boom'); }); } catch (e) { threw = e.message; }
  ok(threw === 'boom', 'run() rethrows the work\'s own error, unchanged');
  const pr = await b.win.OmegaEvents.run('editor', 'p', {}, () => Promise.resolve('async'));
  ok(pr === 'async', 'run() passes a promise\'s value through');
  const cyc = {}; cyc.self = cyc;
  let safe = true; try { b.win.OmegaEvents.run('editor', 'c', cyc, () => 1); b.win.OmegaEvents.emit(null, cyc); } catch (e) { safe = false; }
  ok(safe, 'unserialisable inputs never throw into the page');
  await b.flush();
  const sent = [].concat.apply([], b.posts.map(p => p.events)).map(e => e.name);
  ok(sent.indexOf('session.started') >= 0 && sent.indexOf('tool.opened') >= 0, 'session.started and tool.opened are automatic');
  ok(sent.filter(n => n === 'tool.run').length === 4 && sent.indexOf('tool.error') >= 0, 'a KEPT session sends every tool.run, and the error');
  const cycRun = [].concat.apply([], b.posts.map(p => p.events)).filter(e => e.props && e.props.calc === 'c')[0];
  ok(cycRun && cycRun.props.inputs === null, 'a cyclic input is recorded as null, not dropped silently');

  b = browser({ cfg: { enabled: true, sampleRate: 0.25 }, sid: sidFor(false, 0.25) });
  await b.tick(); await b.tick();
  b.win.OmegaEvents.run('editor', 'x', {}, () => 1);
  b.win.OmegaEvents.error('editor', 'x', new Error('e'));
  await b.flush();
  const sent2 = [].concat.apply([], b.posts.map(p => p.events)).map(e => e.name);
  ok(sent2.indexOf('tool.run') < 0 && sent2.indexOf('tool.error') >= 0, 'a DROPPED session sends no tool.run but still sends errors');
  const t = JSON.parse(b.store['omega-ev-tally']);
  ok(t.counts['tool.run|editor'] === 1, 'a dropped session is still COUNTED for the daily rollup');

  b = browser({ cfg: { enabled: true, sampleRate: 1 }, tally: { day: '2026-09-01', counts: { 'tool.run|editor': 7 } } });
  await b.flush();
  const roll = [].concat.apply([], b.posts.map(p => p.events)).filter(e => e.name === 'activity.rollup')[0];
  ok(roll && roll.props.day === '2026-09-01' && roll.props.counts['tool.run|editor'] === 7, 'a finished day\'s tally goes out as activity.rollup on the next load');

  b = browser({ cfg: { enabled: false, termsOk: false } });
  await b.tick(); await b.tick();
  b.win.OmegaEvents.run('editor', 'x', {}, () => 1);
  await b.flush();
  ok(b.posts.length === 0, 'when the server says no (terms / off / excluded) the tab sends NOTHING');
}

(async function () {
  await gatesTests();
  await clientTests();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nevents: all passed');
  process.exit(fails ? 1 : 0);
})();
