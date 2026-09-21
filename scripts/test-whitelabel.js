#!/usr/bin/env node
/* The white-label storefront's two silent failure modes.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Both of these are wrong in a way that looks fine: nothing throws, nothing
   logs, and the page renders. They are found by reading the data months later
   or by a customer telling you.

   1 · ORIGIN MATCHING ON A DOT BOUNDARY.
       An allowlist entry of '.cleancell.us' must admit www.cleancell.us and
       refuse evilcleancell.us. A suffix test written the obvious way
       (host.endsWith('cleancell.us')) admits both, and the second one is a
       site we have never heard of taking orders in a customer's name.

   2 · THE WORLD-READABLE MIRROR LEAKING A KEY NOBODY MEANT TO PUBLISH.
       tenant_public is `allow read: if true`. pickPublic() is the only thing
       standing between omega_orgs/{org}.whiteLabel and the open internet, and
       the failure mode is a key ADDED NEXT YEAR that a spread would have
       forwarded. So the test asserts the allowlist behaviour on a key that
       does not exist yet, which is the case a snapshot test would miss.

   Also checks the tier ladder, because 'deluxe' was missing from it and every
   Performance account silently resolved as Standard.

   node scripts/test-whitelabel.js */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; return; }
  fail++; console.error('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : ''));
}

/* ── Loading the module under test without node_modules ─────────────────
   _lib/embed.js requires _lib/admin.js, which requires firebase-admin. The
   rest of `npm test` runs with no dependencies installed (nothing else in the
   suite touches /api/_lib), and a test that only runs after npm install is a
   test that stops running.

   The functions under test are PURE — origin matching and key shape — so the
   dependency is stubbed rather than installed. Deliberately a stub that
   THROWS on use: if a future refactor makes one of these functions reach for
   Firestore, this test should fail loudly rather than pass against a mock
   that quietly returned undefined. */
var Module = require('module');
var realLoad = Module._load;
Module._load = function (request) {
  if (request === 'firebase-admin') {
    var boom = function () { throw new Error('test stub: firebase-admin must not be used by a pure function'); };
    return { apps: [], initializeApp: function () {}, credential: { cert: boom },
             firestore: boom, auth: boom };
  }
  return realLoad.apply(this, arguments);
};

/* ── 1 · Origin matching ─────────────────────────────────────────────── */
var E = require(path.join(ROOT, 'api/_lib/embed.js'));

var LIST = ['https://cleancell.us', '.cleancell.us'];

ok('exact origin matches',            E.originAllowed(LIST, 'https://cleancell.us') === true);
ok('www subdomain matches via dot',   E.originAllowed(LIST, 'https://www.cleancell.us') === true);
ok('deep subdomain matches via dot',  E.originAllowed(LIST, 'https://shop.eu.cleancell.us') === true);
ok('http scheme still matches host',  E.originAllowed(LIST, 'http://www.cleancell.us') === true);

/* THE ONE THAT MATTERS. */
ok('lookalike domain is REFUSED',     E.originAllowed(LIST, 'https://evilcleancell.us') === false,
   E.originAllowed(LIST, 'https://evilcleancell.us'));
ok('suffix-in-the-middle is REFUSED', E.originAllowed(LIST, 'https://cleancell.us.evil.com') === false);
ok('unrelated domain is REFUSED',     E.originAllowed(LIST, 'https://example.com') === false);
ok('empty origin is REFUSED when a list exists', E.originAllowed(LIST, '') === false);

/* An empty list means "no restriction", which seed-embed-key.js refuses to
   write without --origins "*". Asserted so the meaning cannot drift. */
ok('empty allowlist admits anything', E.originAllowed([], 'https://example.com') === true);
ok('empty allowlist admits no origin at all', E.originAllowed([], '') === true);

/* normOrigin reduces a Referer (full URL) and an Origin to the same thing. */
ok('Referer reduces to an origin',
   E.normOrigin('https://www.cleancell.us/pages/storage?utm=1') === 'https://www.cleancell.us');
ok('Origin passes through lowercased',
   E.normOrigin('HTTPS://Cleancell.US') === 'https://cleancell.us');
ok('garbage reduces to empty',        E.normOrigin('not a url') === '');

/* ── 2 · Key shape ─────────────────────────────────────────────────────
   The key becomes a Firestore document id. A slash would address a different
   collection; the shape check is what stops that. */
function keyOf(k) { return E.keyFrom({ headers: {}, query: { k: k }, body: {} }); }
ok('a well-formed key is accepted',  keyOf('omega_pk_live_' + 'a'.repeat(32)) !== '');
ok('a path-traversing key is refused', keyOf('omega_pk_live_x/../../admin/secret') === '');
ok('a foreign-prefixed key is refused', keyOf('sk_live_deadbeefdeadbeef') === '');
ok('an empty key is refused',        keyOf('') === '');
ok('a very long key is refused',     keyOf('omega_pk_live_' + 'a'.repeat(300)) === '');

/* ── 3 · The world-readable mirror ─────────────────────────────────────── */
var W = require(path.join(ROOT, 'api/_lib/whitelabel.js'));

var block = {
  enabled: true,
  platformName: 'Clean Cell Power Platform',
  attribution: 'powered-by',
  embed: { origins: ['https://cleancell.us'], headline: 'Size it' },
  /* Things that must NOT cross into a document served to anybody who asks. */
  fulfilment: { warehouse: 'Clinton IA', carrier: 'internal' },
  marginPct: 18.5,
  internalContact: 'tommy@clearsky-usa.com',
  /* The real test: a key invented AFTER this file was written. */
  someFieldAddedNextYear: 'must not leak'
};
var pub = W.pickPublic(block);

ok('platformName crosses',   pub.platformName === 'Clean Cell Power Platform');
ok('attribution crosses',    pub.attribution === 'powered-by');
ok('embed crosses',          !!pub.embed && pub.embed.headline === 'Size it');
ok('fulfilment does NOT',    pub.fulfilment === undefined, pub.fulfilment);
ok('marginPct does NOT',     pub.marginPct === undefined, pub.marginPct);
ok('internalContact does NOT', pub.internalContact === undefined, pub.internalContact);
ok('a key added later does NOT leak by default',
   pub.someFieldAddedNextYear === undefined, pub.someFieldAddedNextYear);
ok('the mirror is a NEW object, not the stored block', pub !== block);
ok('no whiteLabel block mirrors as null', W.pickPublic(null) === null);
ok('pickPublic refuses a non-object', W.pickPublic('nope') === null);

/* ── 4 · The tier ladder ───────────────────────────────────────────────
   'deluxe' is what billing/current.tier says for a Performance account
   (omega-caps.js LADDER, api/tenant-billing.js TIERS, the admin console
   dropdown). It was absent from both maps in omega-tenant.js and from
   TIER_PUBLIC in the seed, so every deluxe tenant fell through to the
   defaults and resolved as tierLevel 1 / "Standard" — with every tier-2 tool
   locked on a paying account. Asserted by reading the source, because these
   are module-private maps in an ES5 IIFE with no export. */
var tenantJs = fs.readFileSync(path.join(ROOT, 'omega-tenant.js'), 'utf8');
var levels = /var TIER_LEVEL = \{([^}]*)\}/.exec(tenantJs);
var labels = /var TIER_LABEL = \{([^}]*)\}/.exec(tenantJs);
ok('TIER_LEVEL exists', !!levels);
ok('TIER_LABEL exists', !!labels);
ok('TIER_LEVEL knows deluxe', !!levels && /deluxe\s*:\s*2/.test(levels[1]), levels && levels[1]);
ok('TIER_LABEL knows deluxe', !!labels && /deluxe\s*:/.test(labels[1]), labels && labels[1]);

var seedJs = fs.readFileSync(path.join(ROOT, 'scripts/seed-omega-orgs.js'), 'utf8');
var tp = /var TIER_PUBLIC = \{([^}]*)\}/.exec(seedJs);
ok('TIER_PUBLIC knows deluxe', !!tp && /deluxe\s*:\s*'deluxe'/.test(tp[1]), tp && tp[1]);

/* Every tier the billing API accepts must be known to the client maps, or the
   next one added has the same silent failure. */
var billing = fs.readFileSync(path.join(ROOT, 'api/tenant-billing.js'), 'utf8');
var tiers = /var TIERS = \[([^\]]*)\]/.exec(billing);
ok('api/tenant-billing.js declares its tiers', !!tiers);
if (tiers) {
  tiers[1].split(',').map(function (s) { return s.trim().replace(/['"]/g, ''); })
    .filter(Boolean).forEach(function (t) {
      ok('tier "' + t + '" is known to TIER_LEVEL',
         !!levels && new RegExp('\\b' + t + '\\s*:').test(levels[1]));
      ok('tier "' + t + '" is known to TIER_LABEL',
         !!labels && new RegExp('\\b' + t + '\\s*:').test(labels[1]));
    });
}

/* ── 5 · The storefront page carries no platform name ──────────────────
   The whole point of the surface. The banner comment says ClearSky-OMEGA on
   purpose (a file the customer can view-source should not pretend to be
   theirs), so comments are stripped before the check — what must be clean is
   what RENDERS. */
var store = fs.readFileSync(path.join(ROOT, 'embed/storefront.html'), 'utf8');
var rendered = store
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
ok('the storefront renders no "ClearSky" anywhere',
   !/ClearSky/i.test(rendered),
   (/.{0,60}ClearSky.{0,60}/i.exec(rendered) || [])[0]);
ok('the storefront renders no "OMEGA" anywhere',
   !/\bOMEGA\b/.test(rendered),
   (/.{0,60}OMEGA.{0,60}/.exec(rendered) || [])[0]);
/* The header names are the exception: they are wire protocol, not copy, and
   they are how api/_lib/embed.js finds the key. Asserted PRESENT so nobody
   "fixes" the check above by renaming them. */
ok('the storefront still sends X-Omega-Embed-Key', /X-Omega-Embed-Key/.test(store));
ok('the storefront still sends X-Omega-Parent', /X-Omega-Parent/.test(store));

/* ── 6 · No cost basis reaches the public sizer's response ─────────────── */
var sizeJs = fs.readFileSync(path.join(ROOT, 'api/embed-size.js'), 'utf8');
/* summarize() hands back capex and paybackYr, both of which invert to the
   tenant's buy price. The response must not carry sum.capex, and the
   sensitivity band must be REBUILT rather than forwarded. */
ok('embed-size never returns sum.capex', !/capex:\s*sum\.capex/.test(sizeJs));
ok('embed-size rebuilds the sensitivity band rather than forwarding it',
   /sensitivity:\s*band/.test(sizeJs) && /nameplateKwh:\s*r\.nameplateKwh/.test(sizeJs));
ok('embed-size reads capex from the tenant record, not the request',
   /pos\(sf\.capexPerKwh\)/.test(sizeJs) && !/b\.capexPerKwh/.test(sizeJs));

/* ── 7 · The order row cannot be dictated by the browser ──────────────── */
var orderJs = fs.readFileSync(path.join(ROOT, 'api/embed-order.js'), 'utf8');
ok('embed-order pins status to new', /status:\s*'new'/.test(orderJs));
ok('embed-order never reads b.status', !/b\.status/.test(orderJs));
ok('embed-order never reads b.pricing', !/b\.pricing/.test(orderJs));
ok('embed-order never reads b.orgId', !/b\.orgId/.test(orderJs));
ok('embed-order sets pricing to null on create', /pricing:\s*null/.test(orderJs));

/* ── 8 · The rules deny the public surface ─────────────────────────────
   The one change that would quietly hand a whole collection to anybody with a
   browser is `allow read: if true` added to one of these to "make the embed
   work". The embed does not need it — it reads through the Admin SDK — so the
   absence is asserted rather than trusted to review. */
var rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');   /* strip comments: they discuss `if true` */

/* Brace-matched from the block BODY's opening brace.

   The first version scanned to the next '}' from 'match /orders/{' — which is
   the closing brace of {orderId}, not of the block. Every assertion below then
   ran against the 21-character string "match /orders/{orderId}" and the
   "contains no `if true`" checks PASSED VACUOUSLY: a test that could not fail.
   Which is the whole failure mode a rules test exists to catch, so it is
   written out rather than quietly corrected. */
function blockOf(name) {
  var i = rules.indexOf('match /' + name + '/{');
  if (i < 0) return null;
  /* Skip the path's own {placeholder}, then find the body's '{'. */
  var afterPath = rules.indexOf('}', i) + 1;
  var open = rules.indexOf('{', afterPath);
  if (open < 0) return null;
  var depth = 0;
  for (var k = open; k < rules.length; k++) {
    if (rules.charAt(k) === '{') depth++;
    else if (rules.charAt(k) === '}') {
      depth--;
      if (depth === 0) return rules.slice(i, k + 1);
    }
  }
  return null;
}

/* The helper has to be able to fail. If blockOf regresses to returning a stub,
   this is the assertion that says so instead of everything below going green. */
(function selfCheck() {
  var b = blockOf('orders');
  ok('blockOf returns a real block, not just the match line',
     !!b && b.length > 80 && b.indexOf('allow') > 0, b && b.slice(0, 60));
})();

['orders', 'embed_keys', 'embed_configs'].forEach(function (c) {
  var b = blockOf(c);
  ok(c + ': has a rules block', !!b);
  if (!b) return;
  ok(c + ': no unauthenticated read', !/allow\s+read[^;]*if\s+true/.test(b), b);
  ok(c + ': no unauthenticated write', !/allow\s+write[^;]*if\s+true/.test(b), b);
  ok(c + ': every allow is conditional', !/allow\s+[a-z, ]+:\s*if\s+true\s*;/.test(b), b);
});

var ordersBlock = blockOf('orders');
ok('orders: no client may create or update', !!ordersBlock
   && /allow\s+create,\s*update:\s*if\s+false/.test(ordersBlock), ordersBlock);
ok('orders: delete is refused for everyone, including staff', !!ordersBlock
   && /allow\s+delete:\s*if\s+false/.test(ordersBlock), ordersBlock);
ok('orders: read uses .get() so pre-field documents do not fail the whole rule',
   !!ordersBlock && /resource\.data\.get\('orgId', ''\)/.test(ordersBlock));

/* The storefront subcollection is nested inside omega_orgs, so blockOf's flat
   scan does not apply. Checked by locating it and reading the two lines. */
var sfAt = rules.indexOf('match /storefront/{docId}');
ok('storefront: has a rules block', sfAt > 0);
if (sfAt > 0) {
  /* Same truncation trap as blockOf: 'match /storefront/{docId}' carries its
     own braces, so skip past them before reading the body. */
  var sfOpen = rules.indexOf('{', rules.indexOf('}', sfAt) + 1);
  var sfBlock = rules.slice(sfAt, rules.indexOf('}', sfOpen + 1) + 1);
  ok('storefront: the block read is a real one, not the match line',
     sfBlock.indexOf('allow') > 0, sfBlock.slice(0, 60));
  ok('storefront: write is ClearSky only — listPrice is what strangers see',
     /allow\s+write:\s*if\s+isAdmin\(\)/.test(sfBlock), sfBlock);
  ok('storefront: no unauthenticated read', !/if\s+true/.test(sfBlock), sfBlock);
}

/* ── 9 · A 5xx must not name our infrastructure on a customer's website ── */
var embedSrc = fs.readFileSync(path.join(ROOT, 'api/_lib/embed.js'), 'utf8');
ok('the embed handler replaces 5xx messages',
   /status >= 500/.test(embedSrc) && /temporarily unavailable/.test(embedSrc));
ok('the embed handler still logs the real error',
   /console\.error\('\[embed\]/.test(embedSrc));

/* ── 10 · The public response is built key by key ──────────────────────
   A spread or Object.assign of a stored document is how a field added next
   year becomes public. publicProduct() and publicConfig() must construct. */
var cfgSrc = fs.readFileSync(path.join(ROOT, 'api/embed-config.js'), 'utf8');
ok('embed-config never spreads a stored document into its response',
   !/\.\.\.(p|c|sf|org)\b/.test(cfgSrc) && !/Object\.assign\(/.test(cfgSrc));
ok('embed-config never returns createdBy off a configuration',
   !/createdBy/.test(cfgSrc.replace(/\/\*[\s\S]*?\*\//g, '')));

console.log('\nwhite-label storefront: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
