/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   POST /api/proforma (api/proforma.js), offline: the gate, the four
   actions and the brand a deck is drawn with. The 'site' action runs the
   real api/_lib/site-lookup.js with a recorded-fixture fetch in place of
   the network (scripts/tests/tsitelookup.js covers the lookup itself).

   The handler is loaded in a vm sandbox with verify-token replaced by a
   stub that answers from an in-memory Firestore, the way
   scripts/test-sizing-api.js loads bess-size.js. Every other module is the
   real one — the finance engine, the sizing bridge, the white-label rule —
   so a 200 here is the response a signed-in tenant gets. An unmapped
   require fails the run, so a new dependency cannot slip in unstubbed.

   The gate is the product's commercial control and the part that is
   easiest to get backwards, so each rule is checked in both directions:
   the case it refuses and the neighbouring case it must let through —
   a public mail domain against a company domain with no record, an
   unverified email (staff included) against a verified one, and the site
   quota's 429 against the colleague, the repeat and the other workspace
   it must still serve.

   No network, no credentials, no npm install.
   Run: node scripts/tests/tproformaapi.js
*/
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var SRC = fs.readFileSync(path.join(ROOT, 'api', 'proforma.js'), 'utf8');
var REAL = {
  whitelabel: require(path.join(ROOT, 'api', '_lib', 'whitelabel')),
  engine: require(path.join(ROOT, 'api', '_lib', 'proforma-engine')),
  sizing: require(path.join(ROOT, 'api', '_lib', 'proforma-sizing')),
  site: require(path.join(ROOT, 'api', '_lib', 'site-lookup')),
  publicDomains: require(path.join(ROOT, 'api', '_lib', 'public-domains'))
};
var FIX = path.join(__dirname, 'fixtures', 'site-lookup');

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }
}
function eq(name, got, want) { ok(name, got === want, got); }
function section(t) { console.log('\n' + t); }
function isPlain(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

/* ── the stubbed world ───────────────────────────────────────────────────── */

function httpError(status, message) { var e = new Error(message); e.status = status; return e; }
/* A document that answers with a thrown read, as readAsCaller does for a
   rules refusal (403) or a Firestore outage (502). */
function THROWS(status) { return { __throws: status || 502 }; }

var ORG = 'example-energy.com';
var BASE = 'omega_orgs/' + ORG;
var UID = 'u/1';   // a slash, so the member path must be encoded
var MEMBER_PATH = BASE + '/members/' + encodeURIComponent(UID);
var BILLING_PATH = BASE + '/billing/current';

/* docs: { path: fields | THROWS(n) }; a missing path is a 404 (null). */
function world(docs, caller) {
  var w = { reads: [], verified: [] };
  w.caller = caller || { uid: UID, email: 'ana@' + ORG, emailVerified: true, orgId: ORG, staff: false, claims: { email_verified: true } };
  w.stub = {
    httpError: httpError,
    verifyIdToken: function (token) {
      w.verified.push(token);
      if (token !== 'good-token') return Promise.reject(httpError(401, 'token signature does not verify'));
      return Promise.resolve(w.caller);
    },
    readAsCaller: function (token, p) {
      w.reads.push({ token: token, path: p });
      var d = docs ? docs[p] : undefined;
      if (d && d.__throws) {
        return Promise.reject(httpError(d.__throws, d.__throws === 403 ? 'the rules refused that read' : 'Firestore returned ' + d.__throws));
      }
      return Promise.resolve(d === undefined ? null : clone(d));
    },
    authenticateWithTier: function () {
      throw new Error('api/proforma.js must read billing itself, not through authenticateWithTier');
    }
  };
  return w;
}

var logged = [];
function load(w, override) {
  override = override || {};
  var box = {
    module: { exports: {} },
    console: { error: function () { logged.push(Array.prototype.slice.call(arguments).join(' ')); }, log: function () {} },
    require: function (n) {
      if (/\/verify-token$/.test(n)) return w.stub;
      if (/\/whitelabel$/.test(n)) return REAL.whitelabel;
      if (/\/public-domains$/.test(n)) return REAL.publicDomains;
      if (/\/proforma-engine$/.test(n)) return override.engine || REAL.engine;
      if (/\/proforma-sizing$/.test(n)) return override.sizing || REAL.sizing;
      if (/\/site-lookup$/.test(n)) return override.site || REAL.site;
      throw new Error('api/proforma.js required an unstubbed module: ' + n);
    }
  };
  box.exports = box.module.exports;
  vm.runInNewContext(SRC, box, { filename: 'api/proforma.js' });
  return box.module.exports;
}

function call(handler, req) {
  var out = { status: 0, body: undefined, headers: {} };
  var res = {
    setHeader: function (k, v) { out.headers[k.toLowerCase()] = v; },
    status: function (n) { out.status = n; return res; },
    json: function (j) { out.body = JSON.parse(JSON.stringify(j)); return res; }
  };
  return Promise.resolve(handler({
    method: req.method || 'POST',
    headers: req.headers || { authorization: 'Bearer good-token' },
    body: req.body === undefined ? { action: 'context' } : req.body
  }, res)).then(function () { return out; });
}

/* Run one POST against a world. */
function post(docs, body, opts) {
  opts = opts || {};
  var w = world(docs, opts.caller);
  return call(load(w, opts.override), { body: body, headers: opts.headers }).then(function (r) { r.world = w; return r; });
}

/* ── fixtures ────────────────────────────────────────────────────────────── */

function docsWith(org, billing, member) {
  var d = {};
  if (org !== undefined) d[BASE] = org;
  if (billing !== undefined) d[BILLING_PATH] = billing;
  if (member !== undefined) d[MEMBER_PATH] = member;
  return d;
}
var ACTIVE = { name: 'Example Energy', status: 'active' };
var STANDARD = { tier: 'standard' };
var MEMBER = { email: 'ana@' + ORG, role: 'member', status: 'active' };
var STAFF = { uid: 'staff-1', email: 'rep@csebuilders.com', emailVerified: true, orgId: 'csebuilders.com', staff: true, claims: { email_verified: true } };
/* A caller as verify-token builds one: emailVerified is its reading (an
   absent claim reads as true), claims is the token. The gate must go by the
   claim. */
function person(email, verifiedClaim, staff) {
  var claims = {};
  if (verifiedClaim !== undefined) claims.email_verified = verifiedClaim;
  return { uid: 'p-' + email, email: email, emailVerified: verifiedClaim !== false,
    orgId: email.split('@')[1], staff: !!staff, claims: claims };
}

/* Topanga, the first reference deck (tproformaengine.js calibrates it):
   315 kW DC solar + 300 kW / 1,800 kWh storage, unlevered, 28 years. */
var TOPANGA = {
  years: 28,
  project: { name: 'Topanga', city: 'Canoga Park', state: 'CA', bocMonth: '2027-02', pisMonth: '2027-10' },
  solar: { kwDc: 315, kwh1: 530984, netKwh1: 530984, degradationPct: 0.4642, netDriftPct: 0.0577 },
  bess: { kw: 300, kwh: 1800 },
  controller: true,
  capex: { lines: [{ id: 'installed', label: 'Installed cost', amount: 1780063.5, asset: 'blended' }] },
  revenue: { ppa: { rate1: 0.225, escalatorPct: 2.5, basis: 'net' } },
  opex: { lines: [{ id: 'opex', label: 'Operating cost', perYear: 22001, escalatorPct: 2.5 }] },
  tax: { itc: { solar: { energyCommunity: true }, storage: { energyCommunity: true } } }
};

/* Twelve bills with a summer bump, the shape tproformasizing.js uses. */
function bills12() {
  var rows = [], m;
  for (m = 0; m < 12; m++) rows.push({ month: m, year: 2025, demandKw: 600 + (m >= 5 && m <= 8 ? 150 : 0), kwh: 200000 });
  return rows;
}
var MONTHLY = { load: { mode: 'monthly', rows: bills12() }, tariff: { demandChargePerKw: 18, energyRate: 0.11 } };

/* The real site lookup, with recorded responses in place of the network and
   no server keys, counting every outbound request so a refused caller can be
   shown to have spent nothing. It keeps what the handler passed (who is
   asking), and has its own quota guard on a clock the test moves (s.now),
   so the handler's 429 is the real limiter's. */
function siteStub(limits) {
  function fixture(name) { return JSON.parse(fs.readFileSync(path.join(FIX, name + '.json'), 'utf8')); }
  var s = { calls: [], opts: [], now: Date.UTC(2026, 8, 24), guard: REAL.site.createGuard(limits) };
  function fakeFetch(url) {
    s.calls.push(url);
    var f = /geocoding\.geo\.census\.gov/.test(url) ? fixture('census-canoga-park-ca')
      : /pvwatts/.test(url) ? fixture('pvwatts-canoga-park-250kw') : fixture('urdb-ladwp-canoga-park');
    return Promise.resolve({ status: f.status, headers: { get: function () { return null; } },
      text: function () { return Promise.resolve(JSON.stringify(f.body)); } });
  }
  s.module = { lookup: function (body, o) {
    s.opts.push(o);
    return REAL.site.lookup(body, { fetch: fakeFetch, env: {}, now: s.now, guard: s.guard, who: o && o.who });
  } };
  return s;
}
var SITE_BODY = { action: 'site', address: { street: '22125 Roscoe Blvd', city: 'Canoga Park', state: 'CA', zip: '91304' },
  solar: { kwDc: 250 } };

/* Keys of a JSON value that hold an array longer than n: the sizing
   response must not echo a load back. */
function longArrays(v, n, where, out) {
  out = out || [];
  if (Array.isArray(v)) {
    if (v.length > n) out.push(where);
    v.forEach(function (x, i) { longArrays(x, n, where + '[' + i + ']', out); });
  } else if (isPlain(v)) {
    Object.keys(v).forEach(function (k) { longArrays(v[k], n, where + '.' + k, out); });
  }
  return out;
}

/* ── the tests ───────────────────────────────────────────────────────────── */

function main() {
  var G = load(world({}))._gate;

  section('Pure gate decisions (_gate.toolAllowed)');
  var ta = G.toolAllowed;
  ok('no billing, no member: the plan decides, and a missing plan is the trial', ta(null, null) === true);
  ok('toolOverrides.proforma false refuses', ta({ tier: 'enterprise', toolOverrides: { proforma: false } }, null) === false);
  ok('an override for another tool is not ours', ta({ tier: 'standard', toolOverrides: { editor: false } }, null) === true);
  ok('an unknown tier is refused', ta({ tier: 'free' }, null) === false);
  ok('toolOverrides.proforma true lifts the tier check', ta({ tier: 'free', toolOverrides: { proforma: true } }, null) === true);
  ok('...but not an org allowlist that lacks the tool', ta({ tier: 'free', toolOverrides: { proforma: true }, toolAccess: ['editor'] }, null) === false);
  ok('every catalogued tier is let through', ['trial', 'standard', 'pro', 'deluxe', 'enterprise', 'partner', 'internal']
    .every(function (t) { return ta({ tier: t }, null); }));
  ok('org toolAccess without proforma refuses', ta({ tier: 'standard', toolAccess: ['editor', 'gridatlas'] }, null) === false);
  ok('org toolAccess [] refuses (absent is not empty)', ta({ tier: 'standard', toolAccess: [] }, null) === false);
  ok('org toolAccess null is absent, not empty', ta({ tier: 'standard', toolAccess: null }, null) === true);
  ok('member toolAccess without proforma refuses', ta({ tier: 'standard' }, { status: 'active', toolAccess: ['editor'] }) === false);
  ok('member toolAccess [] refuses', ta({ tier: 'standard' }, { toolAccess: [] }) === false);
  ok('lists intersect: member has it, org does not', ta({ tier: 'standard', toolAccess: ['editor'] }, { toolAccess: ['proforma'] }) === false);
  ok('lists intersect: both have it', ta({ tier: 'standard', toolAccess: ['proforma'] }, { toolAccess: ['proforma', 'editor'] }) === true);
  ok('a disabled member refuses', ta({ tier: 'standard' }, { status: 'disabled' }) === false);
  ok('a member with no status is not refused for it', ta({ tier: 'standard' }, { role: 'member' }) === true);

  section('Pure brand decisions (_gate.brandOf)');
  var bo = G.brandOf;
  var nx = bo({ name: 'Acme Power', logoUrl: '/tenants/acme/logo.png',
    colors: { primary: '#54b442', accent: '#3E8A30', ink: '#1A1D23' },
    exportBrand: { name: 'Acme', logo: '/tenants/acme/export.png', accent: '#112233', tagline: 'Powering what’s **NEXT**' } }, 'acme.com');
  eq('exportBrand.name leads', nx.name, 'Acme');
  eq('exportBrand.logo leads', nx.logoUrl, '/tenants/acme/export.png');
  eq('primary is normalised to upper-case hex', nx.colors.primary, '#54B442');
  eq('set colors are not overridden by exportBrand.accent', nx.colors.accent, '#3E8A30');
  eq('tagline carried, markdown and all', nx.tagline, 'Powering what’s **NEXT**');
  eq('white label off: no attribution line', nx.attribution, '');
  eq('white label off: the platform keeps its name', nx.platformName, 'ClearSky-OMEGA');
  var bare = bo(null, 'bare-tenant.com');
  eq('no record: named by its orgId', bare.name, 'bare-tenant.com');
  eq('no record: no logo', bare.logoUrl, '');
  eq('no record: no colours (the renderer derives or defaults)', bare.colors, null);
  eq('no record: no tagline', bare.tagline, '');
  eq('org.name when there is no exportBrand', bo({ name: 'Org Name' }, 'x.com').name, 'Org Name');
  eq('org.logoUrl when there is no exportBrand logo', bo({ logoUrl: 'https://cdn.example.com/l.png' }).logoUrl, 'https://cdn.example.com/l.png');
  eq('exportBrand.logoUrl is read too', bo({ exportBrand: { logoUrl: '/l2.png' } }).logoUrl, '/l2.png');
  [
    ['javascript:alert(1)', 'javascript:'], ['JaVaScRiPt:alert(1)', 'javascript: in mixed case'],
    ['data:image/png;base64,AAAA', 'data:'], ['http://example.com/logo.png', 'plain http'],
    ['//evil.example/logo.png', 'protocol-relative'], ['/\\evil.example/logo.png', '/\\ (another origin to a browser)'],
    ['https://x.example/a"onerror="alert(1)', 'a quote'], ['https://x.example/<script>', 'an angle bracket'],
    ['logo.png', 'a relative path'], ['  ', 'blank'], [{ url: '/x.png' }, 'an object']
  ].forEach(function (c) {
    eq('logo refused: ' + c[1], bo({ exportBrand: { logo: c[0] } }).logoUrl, '');
  });
  eq('an unusable export logo falls back to the org logo', bo({ logoUrl: '/org.png', exportBrand: { logo: 'javascript:alert(1)' } }).logoUrl, '/org.png');
  var cs = bo({ colors: { primary: 'red', accent: '#12345G', ink: '#abc' } }).colors;
  eq('named colour refused', cs.primary, null);
  eq('bad hex refused', cs.accent, null);
  eq('3-digit hex expanded', cs.ink, '#AABBCC');
  eq('no valid colour at all is null, not an empty object',
    bo({ colors: { primary: 'url(x)', accent: 'javascript:1', ink: '#1234567' } }).colors, null);
  eq('exportBrand.accent fills an unset primary', bo({ exportBrand: { accent: '#0a7' } }).colors.primary, '#00AA77');
  eq('exportBrand.accent is hex-checked too', bo({ exportBrand: { accent: 'expression(1)' } }).colors, null);
  var wl = bo({ name: 'Grid Co', whiteLabel: { enabled: true, platformName: 'GridOS' } });
  eq('white label on: its platform name', wl.platformName, 'GridOS');
  eq('white label on, attribution unset: our name still printed', wl.attribution, 'Powered by ClearSky OMEGA');
  eq('white label on, attribution none: no line', bo({ whiteLabel: { platformName: 'GridOS', attribution: 'none' } }).attribution, '');
  eq('white label on, custom attribution text', bo({ whiteLabel: { platformName: 'GridOS', attributionText: 'Built on OMEGA' } }).attribution, 'Built on OMEGA');
  var off = bo({ whiteLabel: { enabled: false, platformName: 'GridOS', attribution: 'none' } });
  eq('white label switched off: platform name is ours', off.platformName, 'ClearSky-OMEGA');
  eq('white label switched off: no attribution line', off.attribution, '');
  eq('control characters stripped from a name', bo({ name: 'A\u0000B\nC' }).name, 'A B C');
  eq('an over-long name is capped', bo({ name: new Array(500).join('x') }).name.length, 120);

  return Promise.resolve()

  /* ── methods ── */
  .then(function () { section('Methods'); return call(load(world({})), { method: 'GET', headers: {} }); })
  .then(function (r) {
    eq('GET needs no token', r.status, 200);
    eq('GET names the finance build', r.body.build, 'pf-1');
    eq('GET names the finance engine', r.body.engines.finance, REAL.engine.VERSION);
    eq('GET names the sizing engine', r.body.engines.sizing, 'battery-tool-engine');
    ok('GET gives no defaults or tables away', !('defaults' in r.body) && !('stateTax' in r.body));
    eq('GET is not cached', r.headers['cache-control'], 'private, no-store');
    return call(load(world({})), { method: 'PUT' });
  })
  .then(function (r) {
    eq('PUT is 405', r.status, 405);
    eq('405 says what is allowed', r.headers.allow, 'GET, POST');
    eq('405 is not cached either', r.headers['cache-control'], 'private, no-store');
  })

  /* ── authentication ── */
  .then(function () { section('Authentication'); return post({}, { action: 'context' }, { headers: {} }); })
  .then(function (r) {
    eq('no bearer token is 401', r.status, 401);
    eq('401 carries ok:false', r.body.ok, false);
    eq('no token: nothing verified', r.world.verified.length, 0);
    eq('no token: nothing read', r.world.reads.length, 0);
    return post({}, { action: 'context' }, { headers: { authorization: 'Bearer forged' } });
  })
  .then(function (r) {
    eq('a token that does not verify is 401', r.status, 401);
    eq('...and reads nothing', r.world.reads.length, 0);
    return post({}, 'not json at all', { headers: { authorization: 'Basic abc' } });
  })
  .then(function (r) {
    eq('the gate runs before the body is parsed (garbage + no token is 401, not 400)', r.status, 401);
    return post({}, { action: 'context' }, { caller: { uid: 'x', email: 'nobody', orgId: '', staff: false } });
  })
  .then(function (r) { eq('an account with no organisation is 403', r.status, 403); })

  /* ── who may sign in at all ── */
  .then(function () {
    section('A work email, verified (before anything is read)');
    /* The hole this closes: orgId is the email domain, gmail.com has no
       omega_orgs record, and a missing record fails open, so every Google
       account shared one workspace with the investor model in it. */
    return post({}, { action: 'context' }, { caller: person('someone@gmail.com', true) });
  })
  .then(function (r) {
    eq('gmail.com with no documents at all: 403', r.status, 403);
    ok('...telling them to use a work email', /work email/.test(r.body.error), r.body.error);
    ok('...and naming the provider', /gmail\.com is a personal email provider/.test(r.body.error), r.body.error);
    eq('...refused before any read', r.world.reads.length, 0);
    return post({}, { action: 'model', inputs: TOPANGA }, { caller: person('someone@gmail.com', true) });
  })
  .then(function (r) {
    eq('...for the model too, not only context', r.status, 403);
    var st = siteStub();
    return post({}, SITE_BODY, { caller: person('someone@outlook.com', true), override: { site: st.module } })
      .then(function (r2) {
        eq('outlook.com cannot run a site lookup', r2.status, 403);
        eq('...and spends no API quota', st.calls.length, 0);
        eq('...the lookup was never called', st.opts.length, 0);
      });
  })
  .then(function () {
    /* Every provider on the ONE list is refused, so a new entry there
       closes this door with no change here. */
    return REAL.publicDomains.reduce(function (p, d) {
      return p.then(function (bad) {
        return post({}, { action: 'context' }, { caller: person('x@' + d, true) }).then(function (r) {
          return r.status === 403 ? bad : bad.concat([d + ':' + r.status]);
        });
      });
    }, Promise.resolve([]));
  })
  .then(function (bad) {
    eq('every domain in api/_lib/public-domains.js is refused', JSON.stringify(bad), '[]');
    return post({}, { action: 'context' }, { caller: person('ana@' + ORG, false) });
  })
  .then(function (r) {
    eq('a work email with email_verified false: 403', r.status, 403);
    ok('...asking them to confirm it', /Confirm your email/.test(r.body.error), r.body.error);
    eq('...refused before any read', r.world.reads.length, 0);
    return post({}, { action: 'context' }, { caller: person('ana@' + ORG, undefined) });
  })
  .then(function (r) {
    /* verify-token reads an absent claim as emailVerified:true; the gate
       must not. */
    eq('a work email with no email_verified claim: 403 (the claim, not emailVerified)', r.status, 403);
    return post({}, { action: 'context' }, { caller: person('ana@' + ORG, 'true') });
  })
  .then(function (r) {
    eq('email_verified "true" as a string is not true', r.status, 403);
    return post({}, { action: 'context' }, { caller: person('ana@' + ORG, true) });
  })
  .then(function (r) {
    eq('a verified work email with no org, billing or member record: allowed (fail open)', r.status, 200);
    eq('...branded with its own orgId', r.body.brand.name, ORG);
    eq('...after reading all three', r.world.reads.length, 3);
    return post({}, { action: 'context' }, { caller: person('ana@example.com', true) });
  })
  .then(function (r) { eq('example.com is on the list (a documentation domain is nobody\'s workspace)', r.status, 403); })

  /* ── the org record ── */
  .then(function () { section('Organisation status (fails open on a missing record)'); return post(docsWith(undefined, STANDARD, MEMBER), { action: 'context' }); })
  .then(function (r) {
    eq('no omega_orgs record: allowed', r.status, 200);
    eq('no record: brand named by orgId', r.body.brand.name, ORG);
    var paths = r.world.reads.map(function (x) { return x.path; }).sort();
    eq('reads the org, its billing and the member, nothing else', JSON.stringify(paths), JSON.stringify([BASE, BILLING_PATH, MEMBER_PATH].sort()));
    ok('every read goes out with the caller\'s own token', r.world.reads.every(function (x) { return x.token === 'good-token'; }));
    return post(docsWith({ name: 'No status yet' }, STANDARD, MEMBER), { action: 'context' });
  })
  .then(function (r) {
    eq('an org with no status is allowed', r.status, 200);
    return ['pending', 'suspended', 'cancelled'].reduce(function (p, s) {
      return p.then(function () {
        return post(docsWith({ name: 'X', status: s }, STANDARD, MEMBER), { action: 'model', inputs: TOPANGA }).then(function (r2) {
          eq(s + ' org is 403', r2.status, 403);
          ok(s + ' refusal says why', new RegExp(s === 'pending' ? 'being set up' : s).test(r2.body.error), r2.body.error);
        });
      });
    }, Promise.resolve());
  })

  /* ── entitlement through the handler ── */
  .then(function () { section('Entitlement through the handler'); return post(docsWith(ACTIVE, { tier: 'enterprise', toolOverrides: { proforma: false } }, MEMBER), { action: 'context' }); })
  .then(function (r) {
    eq('toolOverrides.proforma false is 403', r.status, 403);
    ok('...saying it is switched off', /switched off/.test(r.body.error), r.body.error);
    return post(docsWith(ACTIVE, { tier: 'enterprise', toolAccess: ['editor', 'gridatlas'] }, MEMBER), { action: 'size', sizing: MONTHLY });
  })
  .then(function (r) {
    eq('a two-tool org (billing.toolAccess lacks proforma) is 403', r.status, 403);
    ok('...naming the organisation\'s product', /organisation's product/.test(r.body.error), r.body.error);
    return post(docsWith(ACTIVE, { tier: 'enterprise', toolAccess: [] }, MEMBER), { action: 'context' });
  })
  .then(function (r) {
    eq('billing.toolAccess [] is 403 (absent is not empty)', r.status, 403);
    return post(docsWith(ACTIVE, { tier: 'enterprise', toolAccess: ['proforma'] }, MEMBER), { action: 'context' });
  })
  .then(function (r) {
    eq('billing.toolAccess that lists proforma is allowed', r.status, 200);
    return post(docsWith(ACTIVE, STANDARD, { status: 'active', toolAccess: ['editor'] }), { action: 'context' });
  })
  .then(function (r) {
    eq('member.toolAccess lacking proforma is 403', r.status, 403);
    ok('...pointing at the workspace admin', /admin/.test(r.body.error), r.body.error);
    return post(docsWith(ACTIVE, STANDARD, { status: 'active', toolAccess: [] }), { action: 'context' });
  })
  .then(function (r) {
    eq('member.toolAccess [] is 403', r.status, 403);
    return post(docsWith(ACTIVE, { tier: 'standard', toolAccess: ['editor'] }, { toolAccess: ['proforma'] }), { action: 'context' });
  })
  .then(function (r) {
    eq('a member list cannot widen past the org list', r.status, 403);
    return post(docsWith(ACTIVE, STANDARD, { status: 'disabled' }), { action: 'context' });
  })
  .then(function (r) {
    eq('a disabled membership is 403', r.status, 403);
    return post(docsWith(ACTIVE, STANDARD, undefined), { action: 'context' });
  })
  .then(function (r) {
    eq('no member record (an auto-joined colleague) is allowed', r.status, 200);
    return post(docsWith(ACTIVE, undefined, MEMBER), { action: 'context' });
  })
  .then(function (r) {
    eq('no billing record: the trial, which is allowed', r.status, 200);
    return post(docsWith(ACTIVE, { tier: 'free' }, MEMBER), { action: 'context' });
  })
  .then(function (r) {
    eq('an unknown tier is 403', r.status, 403);
    ok('...naming the plan', /free plan/.test(r.body.error), r.body.error);
    return post(docsWith(ACTIVE, { tier: 'free', toolOverrides: { proforma: true } }, MEMBER), { action: 'context' });
  })
  .then(function (r) { eq('an unknown tier with toolOverrides.proforma true is allowed', r.status, 200); })

  /* ── thrown reads ── */
  .then(function () { section('A read that throws is 503, never a pass'); return post(docsWith(THROWS(403), STANDARD, MEMBER), { action: 'context' }); })
  .then(function (r) {
    eq('org read refused by the rules: 503', r.status, 503);
    ok('...saying access could not be checked', /could not check access/i.test(r.body.error), r.body.error);
    return post(docsWith(ACTIVE, STANDARD, THROWS(502)), { action: 'context' });
  })
  .then(function (r) {
    eq('member read 502: 503', r.status, 503);
    /* The regression this exists for: authenticateWithTier answers a failed
       billing read with {} and so no toolAccess, which would hand a
       two-tool tenant every tool for as long as Firestore was unwell. */
    return post(docsWith(ACTIVE, THROWS(502), MEMBER), { action: 'model', inputs: TOPANGA });
  })
  .then(function (r) { eq('billing read 502: 503, not the trial', r.status, 503); })

  /* ── staff ── */
  .then(function () {
    section('Staff');
    var d = {};
    d['omega_orgs/csebuilders.com'] = { name: 'ClearSky', status: 'suspended', exportBrand: { logo: '/clearsky.png' } };
    return post(d, { action: 'context' }, { caller: STAFF });
  })
  .then(function (r) {
    eq('staff skip entitlement (their own org record says suspended)', r.status, 200);
    eq('staff read only their own org, for the brand', JSON.stringify(r.world.reads.map(function (x) { return x.path; })), JSON.stringify(['omega_orgs/csebuilders.com']));
    eq('staff decks carry their own brand', r.body.brand.logoUrl, '/clearsky.png');
    return post({ 'omega_orgs/csebuilders.com': THROWS(502) }, { action: 'context' }, { caller: STAFF });
  })
  .then(function (r) {
    eq('a failed brand read cannot fail a staff session', r.status, 200);
    eq('...the brand falls back to the orgId', r.body.brand.name, 'csebuilders.com');
    /* Anybody can open a password account on rep@csebuilders.com without
       owning the mailbox, and verify-token calls that staff. */
    var d = {};
    d['omega_orgs/csebuilders.com'] = { name: 'ClearSky', status: 'suspended' };
    return post(d, { action: 'context' }, { caller: person('rep@csebuilders.com', false, true) });
  })
  .then(function (r) {
    eq('an UNVERIFIED staff address is refused', r.status, 403);
    ok('...as an unverified email, not waved through as staff', /Confirm your email/.test(r.body.error), r.body.error);
    eq('...before any read (the staff branch never ran)', r.world.reads.length, 0);
    return post({}, { action: 'model', inputs: TOPANGA }, { caller: person('rep@clearsky-usa.com', undefined, true) });
  })
  .then(function (r) {
    eq('a staff address with no email_verified claim is refused too', r.status, 403);
    return post({}, { action: 'context' }, { caller: person('rep@clearsky-usa.com', true, true) });
  })
  .then(function (r) {
    eq('a VERIFIED staff address is staff again', r.status, 200);
    eq('...reading only its own org, for the brand', JSON.stringify(r.world.reads.map(function (x) { return x.path; })), JSON.stringify(['omega_orgs/clearsky-usa.com']));
  })

  /* ── requests ── */
  .then(function () { section('Request shape'); return post(docsWith(ACTIVE, STANDARD, MEMBER), {}); })
  .then(function (r) {
    eq('no action is 400', r.status, 400);
    ok('...listing the actions', /context, size, model/.test(r.body.error), r.body.error);
    return post(docsWith(ACTIVE, STANDARD, MEMBER), { action: 'delete-everything' });
  })
  .then(function (r) {
    eq('an unknown action is 400', r.status, 400);
    return post(docsWith(ACTIVE, STANDARD, MEMBER), [1, 2, 3]);
  })
  .then(function (r) {
    eq('an array body is 400', r.status, 400);
    return post(docsWith(ACTIVE, STANDARD, MEMBER), '{"action":"model","inputs":{"years":"forever"}}');
  })
  .then(function (r) {
    eq('a text/plain JSON body is parsed (model reached: 400 with errors)', r.status, 400);
    ok('...and the errors are the engine\'s', Array.isArray(r.body.errors) && r.body.errors.length > 0, r.body);
    return post(docsWith(ACTIVE, STANDARD, MEMBER), '{"action":');
  })
  .then(function (r) { eq('a body that is not JSON is 400', r.status, 400); })

  /* ── context ── */
  .then(function () {
    section('context');
    return post(docsWith({ name: 'NextGen Power', status: 'active', logoUrl: '/tenants/ng/logo.png',
      colors: { primary: '#54B442', accent: '#3E8A30', ink: '#1A1D23' },
      exportBrand: { name: 'NextGen', logo: '/tenants/ng/logo.png', accent: '#54B442', tagline: 'Powering what’s **NEXT**' } }, { tier: 'enterprise' }, MEMBER), { action: 'context' });
  })
  .then(function (r) {
    eq('context is 200', r.status, 200);
    eq('ok:true', r.body.ok, true);
    eq('orgId is the caller\'s', r.body.orgId, ORG);
    eq('a branded tenant: its export name', r.body.brand.name, 'NextGen');
    eq('a branded tenant: its primary', r.body.brand.colors.primary, '#54B442');
    eq('a branded tenant: its tagline', r.body.brand.tagline, 'Powering what’s **NEXT**');
    eq('brand keys are exactly the contract\'s', Object.keys(r.body.brand).sort().join(','), 'attribution,colors,logoUrl,name,platformName,tagline');
    ok('defaults are the engine\'s own', JSON.stringify(r.body.defaults) === JSON.stringify(REAL.engine.defaults()));
    eq('the state tax table is the engine\'s', r.body.stateTax.CA, REAL.engine.STATE_TAX.CA);
    eq('...all 50 states and DC', Object.keys(r.body.stateTax).length, 51);
    /* A second tenant with nothing set proves no tenant is a default. */
    return post(docsWith({ status: 'active' }, STANDARD, MEMBER), { action: 'context' });
  })
  .then(function (r) {
    eq('a bare tenant: named by its orgId, never another tenant', r.body.brand.name, ORG);
    eq('a bare tenant: no colours', r.body.brand.colors, null);
    eq('a bare tenant: no tagline', r.body.brand.tagline, '');
    eq('a bare tenant: no logo', r.body.brand.logoUrl, '');
    return post(docsWith({ status: 'active', exportBrand: { logo: 'javascript:alert(document.cookie)' },
      colors: { primary: '"><script>' }, whiteLabel: { enabled: true, platformName: 'GridOS', attribution: 'powered-by' } }, STANDARD, MEMBER), { action: 'context' });
  })
  .then(function (r) {
    eq('a hostile logo URL is dropped end to end', r.body.brand.logoUrl, '');
    eq('a hostile colour is dropped end to end', r.body.brand.colors, null);
    eq('white label on: platform name', r.body.brand.platformName, 'GridOS');
    eq('white label on: attribution', r.body.brand.attribution, 'Powered by ClearSky OMEGA');
  })

  /* ── model ── */
  .then(function () { section('model'); return post(docsWith(ACTIVE, STANDARD, MEMBER), { action: 'model', inputs: { years: 90, capex: 'lots' } }); })
  .then(function (r) {
    eq('bad inputs are 400', r.status, 400);
    eq('400 carries ok:false', r.body.ok, false);
    ok('every error has a field and a message', r.body.errors.length >= 2 && r.body.errors.every(function (e) {
      return typeof e.field === 'string' && typeof e.message === 'string' && e.message.length > 0;
    }), r.body.errors);
    return post(docsWith(ACTIVE, STANDARD, MEMBER), { action: 'model' });
  })
  .then(function (r) {
    eq('no inputs at all is 400, not 500', r.status, 400);
    return post(docsWith(ACTIVE, STANDARD, MEMBER), { action: 'model', inputs: TOPANGA });
  })
  .then(function (r) {
    eq('Topanga is 200', r.status, 200);
    eq('ok:true', r.body.ok, true);
    var R = r.body.result || {};
    eq('result.version', R.version, 'pf-1');
    eq('one row per year', (R.rows || []).length, 28);
    ok('the contract\'s top-level blocks are all there', ['inputs', 'sourcesUses', 'capex', 'tax', 'revenue', 'opex', 'metrics', 'rows', 'year0', 'sensitivity', 'warnings', 'assumptions']
      .every(function (k) { return k in R; }), Object.keys(R));
    /* The same numbers the engine's calibration asserts, through the door. */
    ok('after-tax IRR is the deck\'s 8.14%', Math.abs(R.metrics.afterTaxIrr * 100 - 8.14) <= 0.02, R.metrics.afterTaxIrr);
    ok('ITC is the deck\'s $640,823', Math.abs(R.tax.itc.face - 640823) <= 1, R.tax.itc.face);
    ok('total uses are the deck\'s $1,785,564', Math.abs(R.sourcesUses.totalUses - 1785564) <= 1, R.sourcesUses.totalUses);
    ok('no Infinity or NaN crossed the wire', !/Infinity|NaN/.test(JSON.stringify(r.body)));
  })

  /* ── size ── */
  .then(function () { section('size'); return post(docsWith(ACTIVE, STANDARD, MEMBER), { action: 'size', sizing: MONTHLY }); })
  .then(function (r) {
    eq('twelve monthly bills are 200', r.status, 200);
    eq('ok:true', r.body.ok, true);
    var S = r.body.sizing || {};
    eq('basis', S.basis, 'monthly');
    eq('engine', S.engine, 'battery-tool-engine');
    ok('a system with power and energy', S.system && S.system.kw > 0 && S.system.usableKwh > 0 && S.system.nameplateKwh >= S.system.usableKwh, S.system);
    ok('year-1 net savings are positive', S.savings && S.savings.netY1 > 0, S.savings);
    eq('one schedule row per year of the default 25-year term', (S.schedule || []).length, 25);
    ok('every schedule row carries finite net savings', (S.schedule || []).every(function (y) { return typeof y.netSavings === 'number' && isFinite(y.netSavings); }));
    eq('twelve months before/after', (S.months || []).length, 12);
    ok('alternatives by duration', Array.isArray(S.alternatives) && S.alternatives.length > 0);
    eq('no load array is echoed back', JSON.stringify(longArrays(S, 40, 'sizing')), '[]');
    return post(docsWith(ACTIVE, STANDARD, MEMBER), { action: 'model', inputs: {
      years: 25,
      project: { name: 'Battery only', state: 'IL', bocMonth: '2027-03', pisMonth: '2027-09' },
      bess: { kw: S.system.kw, kwh: S.system.nameplateKwh, sizing: S },
      capex: { lines: [{ id: 'bess', label: 'Battery', amount: S.system.nameplateKwh * 400 + S.system.kw * 250, asset: 'storage' }] },
      revenue: { bess: { mode: 'shared-savings', sharePct: 80 } },
      opex: { lines: [{ id: 'om', label: 'O&M', perYear: S.system.kw * 10 }] }
    } });
  })
  .then(function (r) {
    eq('the size result models straight through: 200', r.status, 200);
    ok('...with the battery earning its share of the savings', r.body.result && r.body.result.revenue.year1.bess > 0, r.body.result && r.body.result.revenue.year1);
    return post(docsWith(ACTIVE, STANDARD, MEMBER), { action: 'size', sizing: { load: { mode: 'monthly', rows: [] } } });
  })
  .then(function (r) {
    eq('no bills is 422', r.status, 422);
    eq('422 carries ok:false', r.body.ok, false);
    eq('422 names the request path', r.body.field, 'load.rows');
    ok('422 says what is wrong', typeof r.body.error === 'string' && r.body.error.length > 0, r.body.error);
    /* A year of hourly readings with not one peak: valid data the engine
       accepts and cannot size, which is 422 and not 400. */
    var flat = [], i;
    for (i = 0; i < 8760; i++) flat.push(500);
    return post(docsWith(ACTIVE, STANDARD, MEMBER), { action: 'size', sizing: { load: { mode: 'interval', values: flat } } });
  })
  .then(function (r) {
    eq('a flat interval year (nothing to shave) is 422', r.status, 422);
    eq('...filed under load', r.body.field, 'load');
    ok('...saying why', /too flat/.test(r.body.error), r.body.error);
    return post(docsWith(ACTIVE, STANDARD, MEMBER), { action: 'size' });
  })
  .then(function (r) { eq('no sizing request is 422', r.status, 422); })

  /* ── site ── */
  .then(function () {
    section('site');
    var st = siteStub();
    return post(docsWith({ name: 'X', status: 'suspended' }, STANDARD, MEMBER), SITE_BODY, { override: { site: st.module } })
      .then(function (r) {
        eq('a suspended org cannot run a site lookup', r.status, 403);
        eq('...and spends no API quota', st.calls.length, 0);
        return post(docsWith(ACTIVE, { tier: 'standard', toolAccess: ['editor'] }, MEMBER), SITE_BODY, { override: { site: st.module } });
      })
      .then(function (r) {
        eq('an org whose product lacks the pro forma cannot either', r.status, 403);
        eq('...still no outbound request', st.calls.length, 0);
        return post(docsWith(ACTIVE, STANDARD, MEMBER), SITE_BODY, { override: { site: st.module } });
      })
      .then(function (r) {
        eq('a located address is 200', r.status, 200);
        eq('ok:true', r.body.ok, true);
        eq('the contract\'s blocks, exactly', Object.keys(r.body).sort().join(','),
          'energyCommunity,errors,geo,lowIncome,ok,solar,tax,utility,warnings');
        eq('state tax is the engine\'s own rate', r.body.tax.statePct, REAL.engine.STATE_TAX.CA);
        eq('energy community from the Treasury table', r.body.energyCommunity.status, 'yes');
        eq('PVWatts production for the 250 kW asked', r.body.solar.kwhAnnual, 407042);
        ok('URDB rates, at most five', r.body.utility && r.body.utility.rates.length > 0 && r.body.utility.rates.length <= 5, r.body.utility);
        eq('no source failed', JSON.stringify(r.body.errors), '{}');
        eq('three requests: geocoder, PVWatts, URDB', st.calls.length, 3);
        return post(docsWith(ACTIVE, STANDARD, MEMBER), { action: 'site', address: { street: '1 Main St<script>', city: 'X', state: 'CA' } },
          { override: { site: st.module } });
      })
      .then(function (r) {
        eq('an address with markup is 400', r.status, 400);
        eq('...naming the field', r.body.field, 'address.street');
        return post(docsWith(ACTIVE, STANDARD, MEMBER), { action: 'site', addresses: [SITE_BODY.address, SITE_BODY.address] },
          { override: { site: st.module } });
      })
      .then(function (r) {
        eq('a list of addresses is 400 (one lookup per request)', r.status, 400);
        ok('...saying so', /one address/i.test(r.body.error), r.body.error);
        eq('invalid requests reached no upstream', st.calls.length, 3);
        var boomSite = { lookup: function () { throw new Error('lookup blew up at /var/task/api/_lib/site-lookup.js'); } };
        return post(docsWith(ACTIVE, STANDARD, MEMBER), SITE_BODY, { override: { site: boomSite } });
      })
      .then(function (r) {
        eq('a lookup fault is 500 with the fixed message', r.status, 500);
        ok('...and nothing of the error', !/blew up|site-lookup/.test(JSON.stringify(r.body)), r.body);
      });
  })

  /* ── site: the shared quota ── */
  .then(function () {
    section('site: the shared quota, through the handler');
    /* Small caps so the test reads; tsitelookup.js holds the real ones. */
    var st = siteStub({ userPerMinute: 2, orgPerHour: 3 });
    var docs = docsWith(ACTIVE, STANDARD, MEMBER);
    function sized(kw) { return { action: 'site', address: SITE_BODY.address, solar: { kwDc: kw } }; }
    var BEN = { uid: 'u/2', email: 'ben@' + ORG, emailVerified: true, orgId: ORG, staff: false, claims: { email_verified: true } };
    var OTHER = person('ola@other-power.com', true);
    function site1(body, caller) { return post(docs, body, { caller: caller, override: { site: st.module } }); }
    return site1(sized(250))
      .then(function (r) {
        eq('a lookup is 200', r.status, 200);
        eq('the handler tells the lookup which workspace is asking', st.opts[0].who.orgId, ORG);
        eq('...and which person (the verified uid, not anything in the body)', st.opts[0].who.uid, UID);
        eq('...and nothing else it could get wrong', Object.keys(st.opts[0]).join(','), 'who');
        eq('three requests', st.calls.length, 3);
        return site1(sized(250));
      })
      .then(function (r) {
        eq('the same lookup again is 200', r.status, 200);
        eq('...answered from the cache: no request', st.calls.length, 3);
        return site1(sized(251));
      })
      .then(function (r) {
        eq('a second different lookup in the minute is 200', r.status, 200);
        return site1(sized(252));
      })
      .then(function (r) {
        eq('the third in a minute (cap 2) is 429', r.status, 429);
        eq('...with Retry-After', r.headers['retry-after'], '60');
        eq('...the same number in the body', r.body.retryAfter, 60);
        eq('...ok:false', r.body.ok, false);
        ok('...saying why and when', /a minute/.test(r.body.error) && /60 s/.test(r.body.error), r.body.error);
        eq('...and no upstream request', st.calls.length, 6);
        eq('...still not cached', r.headers['cache-control'], 'private, no-store');
        return site1(sized(252), BEN);
      })
      .then(function (r) {
        eq('a colleague\'s lookup is 200 (the workspace\'s third of 3)', r.status, 200);
        st.now += 60000;
        return site1(sized(253));
      })
      .then(function (r) {
        eq('a minute on, the workspace\'s hour is still spent: 429', r.status, 429);
        ok('...naming the workspace', /workspace/.test(r.body.error), r.body.error);
        eq('...retry when its first lookup leaves the hour', r.headers['retry-after'], '3540');
        return site1(sized(250));
      })
      .then(function (r) {
        eq('a site it already looked up is still answered', r.status, 200);
        return site1(sized(253), OTHER);
      })
      .then(function (r) {
        eq('another workspace is untouched', r.status, 200);
        eq('...and it is the other workspace that was counted', st.opts[st.opts.length - 1].who.orgId, 'other-power.com');
        st.now += 3600000;
        return site1(sized(253));
      })
      .then(function (r) {
        eq('an hour on, the workspace may look up again', r.status, 200);
        return site1({ action: 'site', address: { street: '1<b>', city: 'X', state: 'CA' } });
      })
      .then(function (r) { eq('a bad address is still a 400 alongside the quota', r.status, 400); });
  })

  /* ── faults ── */
  .then(function () {
    section('A fault is 500 with a fixed message, and the stack stays in the log');
    logged.length = 0;
    var boom = { VERSION: 'pf-1', STATE_TAX: {}, defaults: function () { return {}; },
      run: function () { throw new Error('secret internal detail at model (/var/task/api/_lib/proforma-engine.js:1)'); } };
    return post(docsWith(ACTIVE, STANDARD, MEMBER), { action: 'model', inputs: TOPANGA }, { override: { engine: boom } });
  })
  .then(function (r) {
    eq('an engine fault is 500', r.status, 500);
    eq('...with the contract\'s message', r.body.error, 'The pro forma could not run; check the inputs and retry.');
    ok('...and nothing of the error in the body', !/secret|proforma-engine|\/var\/task/.test(JSON.stringify(r.body)), r.body);
    ok('the fault is logged for the function log', logged.length === 1 && /\[proforma\] model failed/.test(logged[0]) && /secret internal detail/.test(logged[0]), logged);
    var boomSize = { size: function () { throw new TypeError('x is undefined'); } };
    return post(docsWith(ACTIVE, STANDARD, MEMBER), { action: 'size', sizing: MONTHLY }, { override: { sizing: boomSize } });
  })
  .then(function (r) {
    eq('a sizing fault is 500 too', r.status, 500);
    ok('...never echoing the TypeError', !/undefined|TypeError/.test(JSON.stringify(r.body)), r.body);
  })

  /* ── source hygiene ── */
  .then(function () {
    section('Source');
    eq('© header on line 1', SRC.split('\n')[0], '/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */');
    var code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
    ok('ES5: no arrows, const/let, template literals, classes, async, spread',
      !/=>|\bconst\s|\blet\s|`|\bclass\s|\basync\s|\.\.\./.test(code));
    ok('ES5: no Object.assign/entries/values, includes/find/startsWith/padStart',
      !/Object\.(assign|entries|values)\b|\.(includes|find|findIndex|startsWith|padStart)\(/.test(code));
    ok('does not require admin.js (runs without firebase-admin)', !/require\([^)]*_lib\/admin['"]/.test(SRC));
    ok('names no tenant', !/nextnrg|tremco|clean ?cell|fenecon|concord/i.test(SRC));
  });
}

main().then(function () {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}, function (e) {
  console.error(e);
  process.exit(1);
});
