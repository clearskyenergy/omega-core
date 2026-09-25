/* What the public site must never say.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Vercel serves the repo root. Every file .vercelignore does not exclude is a
   URL that anybody can fetch without signing in, and a tenant's customer is
   given several of them (the customer manifest's icons live in the tenant's
   folder, the sandbox is linked from the kit). So what we write in a served
   file, including a code comment or a placeholder, is published.

   Two failures this exists for (the 2026-09-24 review):

   1 · A TENANT'S CUSTOMERS NAMED ON THE PUBLIC SITE. Clean Cell's first live
       buyer was the example in the office's "Company email domain"
       placeholder, in code comments, in an API error message; InCharge
       Energy, another real Clean Cell customer, was the sample company in
       the PO-sheet example and the sandbox. One Clean Cell customer could
       read another's name, and every visitor could read both. DENY below
       fails the test on any served file that says one of them.

   2 · LIVE-1. tenants/cleancell/tenant.json is fetched over HTTP by
       whitelabel-setup.html, so it is public — and it carried the account's
       tier, add-ons, trial and due dates and ~13K characters of internal
       notes. The notes now live in NOTES.md and the billing in billing.json,
       both kept off the site by .vercelignore. This proves the served folder
       carries none of it and still carries everything its readers need.

   A name that must not appear anywhere is not written here in the clear
   either: the buyer's company, its people and its PO code are matched by
   SHA-256 in scripts/_lib/discreet.js (the one matcher, which also says how
   to add a word). The exceptions below say WHY in words, without the name.

   node scripts/tests/tdiscreet.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..');

var pass = 0, fail = 0;
function ok(m, c, got) {
  if (c) { pass++; return; }
  fail++; console.log('  FAIL ' + m + (got !== undefined ? '\n       got: ' + (typeof got === 'string' ? got : JSON.stringify(got)) : ''));
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

/* ── THE DENY LIST: scripts/_lib/discreet.js ───────────────────────────── */
var D = require('../_lib/discreet'), hits = D.hits;

/* ── THE EXCEPTIONS, EACH PINNED ────────────────────────────────────────── */
/* The same company is ALSO a capital partner of ClearSky's: the finance
   portal's first-look partner, the OSA joint venture's lease counterparty,
   an investor on NextNRG's portfolio, a channel partner in the master
   console. That is a separate, legitimate relationship, and the owner's
   decision (2026-09-24) is to leave those listings alone: several are
   working configuration (a workspace map, a first-look key, a brand map)
   and the rest describe that deal. They are NOT the Clean Cell buyer.

   Each exception allows the 'buyer' patterns only, never InCharge or a
   hashed word, and is pinned to the number of mentions the path has today:
   a NEW mention in one of these files still fails, and says so. A pin that
   is higher than today's count is reported so it can be lowered. */
var ALLOW = [
  { path: 'editor.html', n: 2, why: 'the partner brand map (an email domain and a slug to a display name) for a capital partner signing in' },
  { path: 'admin/', n: 9, why: 'the master console (ClearSky staff only): partner and ecosystem records and their placeholders' },
  { path: 'portals/finance/', n: 16, why: 'the financing marketplace: the first-look capital partner is its configuration' },
  { path: 'tenants/osa/', n: 16, why: 'JV partner territory (CODEOWNERS): the lease counterparty on the JV\'s projects' },
  { path: 'tenants/nextnrg/workspaces.js', n: 5, why: 'NextNRG\'s workspace map: the investor workspace on its portfolio' },
  { path: 'marketplace.html', n: 4, why: 'the marketplace\'s workspace map: the same investor workspace' },
  { path: 'index.html', n: 1, why: 'a comment on the finance first-look hold' },
  { path: 'omega-fees.js', n: 1, why: 'the finder\'s-fee schedule comment (the financing deal, not the Clean Cell order)' },
  { path: 'owner-reporting.html', n: 2, why: 'sample investor-reporting recipient (the financing relationship)' },
  { path: 'sla-intelligence.html', n: 1, why: 'sample O&M counterparty (the financing relationship)' },
  { path: 'jda.html', n: 3, why: 'the JDA page: what the capital partner takes a project at' }
];
/* A hashed word that is also something else in a public dataset, pinned
   the same way. */
var ALLOW_HASHED = [
  { path: 'api/_lib/datacenters.js', hash: '461f09556c26f2100aaac02b36fb3b73303bd9f884a937f7c983e1e5c1148a48', n: 1, why: 'a place name in the public list of data-centre campuses, not a person' },
  { path: 'ci-industrial.js', hash: '461f09556c26f2100aaac02b36fb3b73303bd9f884a937f7c983e1e5c1148a48', n: 1, why: 'a property owner\'s company name in the public county parcel records, not a person' }
];

/* ── WHAT IS SERVED: .vercelignore, read the way Vercel reads it ────────── */
/* gitignore rules: a pattern with no slash but a trailing one matches a
   name at any depth; a slash inside anchors it to the root; '*' stays in
   one segment; the last matching line wins; '!' re-includes. */
function globRe(g) {
  var out = '';
  for (var i = 0; i < g.length; i++) {
    var c = g.charAt(i);
    if (c === '*') { if (g.charAt(i + 1) === '*') { out += '.*'; i++; } else out += '[^/]*'; }
    else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return out;
}
var IGNORE = read('.vercelignore').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l && l.charAt(0) !== '#'; }).map(function (l) {
  var neg = l.charAt(0) === '!'; if (neg) l = l.slice(1);
  var dir = /\/$/.test(l); l = l.replace(/\/$/, '');
  var anchored = l.indexOf('/') >= 0; l = l.replace(/^\//, '');
  return { neg: neg, re: new RegExp((anchored ? '^' : '(^|/)') + globRe(l) + (dir ? '/' : '(/|$)')) };
});
function ignored(rel) {
  var out = false;
  IGNORE.forEach(function (p) { if (p.re.test(rel)) out = !p.neg; });
  return out;
}
/* ignored() of a directory is asked with its trailing slash, as git does */
var TEXT = /\.(html?|m?js|cjs|json|css|webmanifest|csv|txt|svg|xml|md)$/i;
var SKIP_DIRS = { '.git': 1, node_modules: 1, api: 1, '.vercel': 1 };
function served() {
  var out = [];
  (function walk(rel) {
    fs.readdirSync(path.join(ROOT, rel)).forEach(function (name) {
      var r = rel ? rel + '/' + name : name, st = fs.statSync(path.join(ROOT, r));
      if (st.isDirectory()) { if (!rel && SKIP_DIRS[name]) return; if (name === '.git' || name === 'node_modules') return; if (!ignored(r + '/')) walk(r); return; }
      if (TEXT.test(name) && !ignored(r)) out.push(r);
    });
  }(''));
  return out;
}
/* api/: not served as files, but what an endpoint SAYS is — an error
   message, a CSV template — and some of its libraries are bundled into the
   public sandbox. Comments stripped (a sandbox bundle is checked whole,
   above, as the served file it is). */
function apiFiles() {
  var out = [];
  (function walk(rel) {
    fs.readdirSync(path.join(ROOT, rel)).forEach(function (name) {
      var r = rel + '/' + name, st = fs.statSync(path.join(ROOT, r));
      if (st.isDirectory()) { if (name !== 'node_modules') walk(r); return; }
      if (/\.(js|json)$/.test(name)) out.push(r);
    });
  }('api'));
  return out;
}
function stripComments(src) {
  var out = '', i = 0, n = src.length, q = null, prev = '';
  while (i < n) {
    var c = src.charAt(i), d = src.charAt(i + 1);
    if (q) { out += c; if (c === '\\') { out += d; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '/' && d === '*') { var e = src.indexOf('*/', i + 2), end = e < 0 ? n : e + 2; out += src.slice(i, end).replace(/[^\n]/g, '') + ' '; i = end; continue; }   /* keep its line breaks, so a hit's line is right */
    if (c === '/' && d === '/') { var nl = src.indexOf('\n', i); i = nl < 0 ? n : nl; continue; }
    if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]|^$/.test(prev)) {   /* a regex literal: copy it through */
      var j = i + 1, cls = false;
      while (j < n) { var x = src.charAt(j); if (x === '\\') { j += 2; continue; } if (x === '[') cls = true; else if (x === ']') cls = false; else if (x === '/' && !cls) break; else if (x === '\n') break; j++; }
      out += src.slice(i, j + 1); i = j + 1; prev = '/'; continue;
    }
    if (c === '"' || c === "'" || c === '`') q = c;
    out += c; if (!/\s/.test(c)) prev = c; i++;
  }
  return out;
}

/* ── THE SCAN ───────────────────────────────────────────────────────────── */
/* each hit says where (the first line): D.hits() */
function allowFor(rel) { return ALLOW.filter(function (a) { return a.path === rel || (/\/$/.test(a.path) && rel.indexOf(a.path) === 0); })[0] || null; }

var files = served(), apis = apiFiles(), allowSeen = {}, bad = [];
ok('the walk finds the served site (pages, the phone apps, the sandbox, the tenant folders)',
   files.indexOf('office/app.html') >= 0 && files.indexOf('portals/customer/app.html') >= 0 && files.indexOf('tenants/cleancell/tenant.json') >= 0 && files.length > 200, files.length);
ok('and none of what .vercelignore keeps off it', !files.some(function (f) { return /^(scripts|docs|workers)\//.test(f) || /\.md$/.test(f) && f.indexOf('tenants/osa/') !== 0; }));

var SEEN_RAW = {};   /* a served file's hits, kept for the whole-repo walk below */
files.map(function (f) { return { rel: f, text: read(f), raw: true }; }).concat(apis.map(function (f) { return { rel: f, text: /\.js$/.test(f) ? stripComments(read(f)) : read(f) }; })).forEach(function (f) {
  var found = hits(f.text); if (f.raw) SEEN_RAW[f.rel] = found; if (!found.length) return;
  var allow = allowFor(f.rel);
  found.forEach(function (h) {
    if (h.key === 'buyer' && allow) { allowSeen[allow.path] = (allowSeen[allow.path] || 0) + h.n; return; }
    var ah = h.key.charAt(0) === '#' && ALLOW_HASHED.filter(function (a) { return a.path === f.rel && '#' + a.hash === h.key; })[0];
    if (ah && h.n <= ah.n) return;
    bad.push(f.rel + ':' + h.line + ' — ' + h.what + ' (' + h.n + '×, ' + h.sample + ')');
  });
});
ok('★ no served file (or endpoint message) names a tenant\'s customer', !bad.length, '\n         ' + bad.join('\n         '));
ALLOW.forEach(function (a) {
  var seen = allowSeen[a.path] || 0;
  ok('the capital-partner listings in ' + a.path + ' did not grow (' + a.why + ')', seen <= a.n, seen + ' mentions, pinned at ' + a.n + ': a new one is the buyer until somebody decides otherwise');
  if (seen < a.n) console.log('  note: ' + a.path + ' now has ' + seen + ' capital-partner mention(s), pinned at ' + a.n + ' — lower the pin');
});

/* ── EVERY FILE, served or not ─────────────────────────────────────────── */
/* The buyer's people and its PO code are written NOWHERE — not in a test, a
   doc or a script (the 2026-09-24 review found a test's own scrub list
   spelling out the person it scrubbed, and a test's pay link still carrying
   the PO code). The company is held the same way in scripts/, where three
   capital-partner tests name it for that other relationship. */
var ALLOW_SCRIPTS = [
  { path: 'scripts/tests/tcapitalpartners.js', n: 4, why: 'the capital-partner roster test (the financing relationship)' },
  { path: 'scripts/tests/tdealroomrefer.js', n: 1, why: 'the deal-room referral test (the financing relationship)' },
  { path: 'scripts/tests/tfees.js', n: 9, why: 'the finder\'s-fee schedule test (the financing deal)' }
];
function everyFile() {
  var out = [];
  (function walk(rel) {
    fs.readdirSync(path.join(ROOT, rel || '.')).forEach(function (name) {
      if (name === '.git' || name === 'node_modules' || name === '.vercel') return;
      var r = rel ? rel + '/' + name : name, st = fs.statSync(path.join(ROOT, r));
      if (st.isDirectory()) { walk(r); return; }
      if ((TEXT.test(name) || /\.(rules|py|sh)$/.test(name)) && st.size < 20 * 1024 * 1024) out.push(r);
    });
  }(''));
  return out;
}
(function () {
  var anywhere = [], inScripts = {}, all = everyFile();
  all.forEach(function (rel) {
    (SEEN_RAW[rel] || hits(read(rel))).forEach(function (h) {
      if (h.key.charAt(0) === '#') {
        var ah = ALLOW_HASHED.filter(function (a) { return a.path === rel && '#' + a.hash === h.key; })[0];
        if (!(ah && h.n <= ah.n)) anywhere.push(rel + ':' + h.line + ' — ' + h.what + ' (' + h.n + '×)');
      } else if (h.key === 'buyer' && rel.indexOf('scripts/') === 0) inScripts[rel] = (inScripts[rel] || 0) + h.n;
    });
  });
  ok('the whole-repo walk reaches scripts/, docs/ and tests/ too', all.indexOf('scripts/test-office-pages.js') >= 0 && all.some(function (f) { return /^docs\//.test(f); }) && all.length > files.length, all.length);
  ok('★ no file anywhere (served or not) names a person at the buyer or its PO code', !anywhere.length, '\n         ' + anywhere.join('\n         '));
  var extra = Object.keys(inScripts).filter(function (f) { var a = ALLOW_SCRIPTS.filter(function (x) { return x.path === f; })[0]; return !a || inScripts[f] > a.n; });
  ok('★ no script names the buyer company, beyond the pinned capital-partner tests', !extra.length, extra.map(function (f) { return f + ' (' + inScripts[f] + '×)'; }));
})();

/* The hashing itself: a word on the list is found, in any case, as a whole
   word, and an ordinary word is not (so the list cannot rot silently). */
(function () {
  var all = Object.keys(D.WORDS).concat(Object.keys(D.CAPITALISED));
  ok('the hashed lists are non-empty and every entry is a SHA-256', all.length >= 4 && all.every(function (h) { return /^[0-9a-f]{64}$/.test(h); }));
  ok('a plain paragraph passes', !hits('The office prices the order and the plant builds it.').length);
  /* The method, proved on a FICTIONAL buyer through the same matcher: a
     real name would have to be written here to be tested, and a name kept
     in base64 is a name anyone can read. The fictional lists are built the
     way the real ones are (discreet.js header). */
  var CO = 'Voltmark Holdings', DOMAIN = 'voltmarkholdings.com', KEY = 'voltmarkholdings', WORD = 'Voltmark', PERSON = 'morgana', PO = 'q7zx';
  function sum(w) { var n = 0; for (var i = 0; i < w.length; i++) n += w.charCodeAt(i); return n; }
  var FW = {}, FC = {};
  FW[D.sha(KEY)] = { key: 'buyer', what: 'the fictional buyer (key)', len: KEY.length, inside: true, sum: sum(KEY) };
  FW[D.sha(PERSON)] = { key: '#person', what: 'a person at the fictional buyer', len: PERSON.length };
  FW[D.sha(PO)] = { key: '#po', what: 'the fictional PO code', len: PO.length };
  FC[D.sha(WORD)] = { key: 'buyer', what: 'the fictional buyer (company)', len: WORD.length };
  var fh = D.matcher(FW, FC, D.PLAIN);
  function buyer(t) { return fh(t).filter(function (h) { return h.key === 'buyer'; }).reduce(function (n, h) { return n + h.n; }, 0); }
  ok('the company is found in a comment, a placeholder and a domain alike',
     buyer('/* e.g. ' + CO + ' */') === 1 && buyer('placeholder="e.g. ' + DOMAIN + '"') === 1 && buyer('"' + KEY.slice(0, 8) + '-' + KEY.slice(8) + '"') === 1 && buyer('var x = "' + WORD + KEY.slice(8, 9).toUpperCase() + KEY.slice(9) + '";') === 2,
     [buyer('/* e.g. ' + CO + ' */'), buyer('placeholder="e.g. ' + DOMAIN + '"'), buyer('"' + KEY.slice(0, 8) + '-' + KEY.slice(8) + '"'), buyer('var x = "' + WORD + KEY.slice(8, 9).toUpperCase() + KEY.slice(9) + '";')]);
  ok('and inside a longer run of letters', buyer('https://www.' + KEY + 'partners.example/') === 1);
  ok('the other customer is found as written', hits('InCharge Bakersfield').length === 1);
  ok('the company\'s word in lowercase, an ordinary word, is not the company', !fh('priced by its ' + WORD.toLowerCase() + ', labeled with ' + WORD.toLowerCase() + '/voltage').length);
  ok('a hashed person and PO code are found in any case, as a whole word, and say only where', fh('Ask Morgana about PO Q7ZX').length === 2 && fh('Ask MORGANA').every(function (h) { return h.sample === 'a hashed word'; }));
  ok('the real lists are what hits() runs on: a fictional name is not on them', !hits('Ask Morgana at ' + DOMAIN).length);
  /* the real samples, when a person who may know them keeps them OUTSIDE
     the repo (OMEGA_DISCREET_SAMPLES=<file>: { company, domain, person, po }) */
  var SAMPLES = process.env.OMEGA_DISCREET_SAMPLES;
  if (SAMPLES && fs.existsSync(SAMPLES)) {
    var sm = JSON.parse(fs.readFileSync(SAMPLES, 'utf8')), key = String(sm.domain || '').split('.')[0];
    ok('(local samples) the real hashes are of the real names', !!(D.CAPITALISED[D.sha(String(sm.company || '').split(' ')[0])] && D.WORDS[D.sha(key)] && D.WORDS[D.sha(String(sm.person || '').toLowerCase())] && D.WORDS[D.sha(String(sm.po || '').toLowerCase())]));
    ok('(local samples) and the real names are found', hits(sm.company + ' ' + sm.domain + ' ' + sm.person + ' PO ' + sm.po).length >= 3);
  }
})();

/* ── .vercelignore, read correctly ─────────────────────────────────────── */
ok('.vercelignore: scripts/, docs/ and every .md are off the site; OSA\'s .md and config.js are on it',
   ignored('scripts/x.js') && ignored('docs/a.md') && ignored('README.md') && !ignored('tenants/osa/PROCESS.md') && ignored('tenants/walters/config.js') && !ignored('tenants/osa/config.js'));

/* ── LIVE-1: what tenants/cleancell/ serves ─────────────────────────────── */
var CC = 'tenants/cleancell/';
ok('★ the notes, the billing and the product CSV are NOT served', ignored(CC + 'NOTES.md') && ignored(CC + 'billing.json') && ignored(CC + 'products.csv'),
   { notes: ignored(CC + 'NOTES.md'), billing: ignored(CC + 'billing.json'), csv: ignored(CC + 'products.csv') });
ok('the files whitelabel-setup.html fetches and the icons the manifests link ARE served',
   !ignored(CC + 'tenant.json') && !ignored(CC + 'products.json') && !ignored(CC + 'icons/customer-192.png'));
var ccServed = files.filter(function (f) { return f.indexOf(CC) === 0; });
ok('the served folder is tenant.json, products.json and icons/, nothing else (a new file there is a decision)',
   ccServed.every(function (f) { return f === CC + 'tenant.json' || f === CC + 'products.json' || /^tenants\/cleancell\/icons\/[\w-]+\.svg$/.test(f); }), ccServed);

var T = JSON.parse(read(CC + 'tenant.json'));
var BILLING = ['tier', 'addons', 'trialEndsAt', 'subscriptionDue', 'amountDue', 'paymentLink', 'stripeCustomerId', 'lastPaidAt', 'autopay', 'paymentProvider', 'toolOverrides', 'capexPerKwh', 'capexPerKw'];
var under = [], billing = [], long = [];
(function walk(o, at) {
  if (Array.isArray(o)) { o.forEach(function (v, i) { walk(v, at + '[' + i + ']'); }); return; }
  if (o && typeof o === 'object') { Object.keys(o).forEach(function (k) { if (k.charAt(0) === '_') under.push(at + '.' + k); if (BILLING.indexOf(k) >= 0) billing.push(at + '.' + k); walk(o[k], at + '.' + k); }); return; }
  if (typeof o === 'string' && o.length > 300) long.push(at + ' (' + o.length + ' chars)');
}(T, ''));
ok('★ the served tenant.json carries no _note (no key starting with _)', !under.length, under);
ok('★ and no billing: no tier, add-ons, dates, amount, payment link or cost basis', !billing.length, billing);
ok('and no prose: every string is a value, not a note (≤ 300 characters)', !long.length, long);
/* what its readers still need: whitelabel-setup.html (orgId, name, domains,
   vertical, shell, status, whiteLabel, storefront), the seed (the same),
   build-app-sandbox.js (name, whiteLabel, appIcon) */
ok('it still carries what whitelabel-setup.html, the seed and the sandbox read',
   T.orgId === 'cleancell.us' && Array.isArray(T.domains) && T.domains.length > 0 && T.vertical === 'oem' && T.status && T.shell
   && T.whiteLabel && T.whiteLabel.shortName && T.whiteLabel.embed && T.whiteLabel.embed.origins.length > 0 && T.storefront && T.storefront.headline
   && T.appIcon && T.appIcon.customer && ['180', '192', '512', 'maskable'].every(function (k) { return T.appIcon.customer[k] && fs.existsSync(path.join(ROOT, T.appIcon.customer[k])); }));
ok('the workspace reads "Clean Cell" (CUST-06)', T.name === 'Clean Cell' && T.whiteLabel.shortName === 'Clean Cell', T.name);
var P = JSON.parse(read(CC + 'products.json'));
ok('products.json is a catalogue and carries no price basis', Array.isArray(P) && P.length > 0 && P.every(function (p) { return BILLING.every(function (k) { return p[k] === undefined; }) && p.cost === undefined && p.buyPrice === undefined && p.margin === undefined; }));

function readIf(rel) { return fs.existsSync(path.join(ROOT, rel)) ? read(rel) : ''; }
var B = JSON.parse(readIf(CC + 'billing.json') || '{}');
ok('billing.json has what the seed needs (tier, add-ons incl. omega-logic, dates) and nothing that prices the account',
   B.tier === 'deluxe' && Array.isArray(B.addons) && B.addons.indexOf('omega-logic') >= 0 && B.trialEndsAt && B.subscriptionDue
   && Object.keys(B).every(function (k) { return ['tier', 'addons', 'trialEndsAt', 'subscriptionDue', 'toolOverrides', 'paymentProvider'].indexOf(k) >= 0; }), B);
var NOTES = readIf(CC + 'NOTES.md');
ok('the notes moved rather than vanished: NOTES.md names each old field and keeps its substance',
   ['`_note`', '`_noteWhiteLabel`', '`_noteSiteStudy`', '`_noteGuidedBuild`', '`_noteFunnel`', '`_noteBrand`', '`storefront._productShape`'].every(function (k) { return NOTES.indexOf(k) >= 0; })
   && /cleancellusa\.com does NOT EXIST/.test(NOTES) && /FIVE THINGS ARE NOT DONE BY THIS FILE/.test(NOTES) && /THE GATE FAILS OPEN ON A MISSING RECORD/.test(NOTES)
   && /IT NEEDS A FOOTPRINT PER PRODUCT/.test(NOTES) && /INTEGRATES\{\} IS THE ONE THAT CHANGES THE DRAWING/.test(NOTES) && /the palette is TEAL/.test(NOTES));
/* not served, but the owner's rule is that no file names the buyer */
ok('★ and neither NOTES.md nor billing.json names a tenant\'s customer', !hits(NOTES).length && !hits(readIf(CC + 'billing.json')).length,
   hits(NOTES).concat(hits(readIf(CC + 'billing.json'))).map(function (h) { return h.what; }));

/* ── the seed still reproduces what the account bought ──────────────────── */
(function () {
  var out = '';
  try { out = cp.execFileSync(process.execPath, [path.join(ROOT, 'scripts/seed-omega-orgs.js')], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { ok('the seed dry run runs', false, (e.stderr || e.message || '').slice(0, 400)); return; }
  var block = (out.split('\n== ').filter(function (b) { return b.indexOf('cleancell.us (cleancell)') === 0; })[0]) || '';
  var line = function (label) { var m = new RegExp('^  ' + label + ': (.*)$', 'm').exec(block); try { return m ? JSON.parse(m[1]) : null; } catch (e) { return null; } };
  var bill = line('billing/current'), org = line('omega_orgs');
  ok('★ the seed still plans deluxe with every add-on (from billing.json), not a repriced standard',
     !!bill && bill.tier === 'deluxe' && bill.addons.indexOf('omega-logic') >= 0 && bill.addons.length === (B.addons || []).length && bill.trialEndsAt === B.trialEndsAt && bill.subscriptionDue === B.subscriptionDue, bill);
  ok('and names the workspace "Clean Cell"', !!org && org.name === 'Clean Cell', org && org.name);
})();

/* ── whitelabel-setup.html: no billing in the file, no billing write ────── */
(function () {
  var src = read('whitelabel-setup.html'), m = /\nfunction billingFromSeed\s*\(/.exec(src);
  ok('whitelabel-setup.html plans billing through billingFromSeed()', !!m);
  if (!m) return;
  var start = m.index + 1, i = src.indexOf('{', start), depth = 0, q = null, text = null;
  for (; i < src.length; i++) {
    var c = src.charAt(i);
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '/' && src.charAt(i + 1) === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }   /* a comment's quotes are prose */
    if (c === '/' && src.charAt(i + 1) === '/') { i = src.indexOf('\n', i); continue; }
    if (c === "'" || c === '"') q = c; else if (c === '{') depth++; else if (c === '}' && --depth === 0) { text = src.slice(start, i + 1); break; }
  }
  if (!text) { ok('billingFromSeed() can be read out of the page', false); return; }
  var fn = vm.runInNewContext('(' + text + ')', {});
  ok('★ the served Clean Cell file plans NO billing write (it used to plan tier "standard" with no add-ons)', fn(T) === null, fn(T));
  ok('a file that carries billing still has it written, field for field', JSON.stringify(fn({ tier: 'pro', addons: ['x'], trialEndsAt: 't' })) === JSON.stringify({ tier: 'pro', addons: ['x'], trialEndsAt: 't' }));
  ok('a tier alone does not wipe the add-ons, and an empty toolAccess is never written', JSON.stringify(fn({ tier: 'pro', toolAccess: [] })) === JSON.stringify({ tier: 'pro' }) && fn({ toolAccess: [] }) === null);
  ok('the product allowlist alone is still written', JSON.stringify(fn({ toolAccess: ['editor', 'gridatlas'] })) === JSON.stringify({ toolAccess: ['editor', 'gridatlas'] }));
  ok('it is ES5 (the page runs in every kiosk browser)', !/=>|\blet\s|\bconst\s|`/.test(text));
  ok('and the old default that repriced an account is gone', src.indexOf("SEED.tier || 'standard'") < 0);
})();

console.log('\ndiscreet: ' + pass + ' passed, ' + fail + ' failed (' + files.length + ' served files, ' + apis.length + ' api files)');
if (fail) process.exit(1);
