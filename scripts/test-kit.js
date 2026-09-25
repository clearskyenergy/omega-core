/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   test-kit.js — the one list of where everything lives (api/_lib/kit.js). */
'use strict';
var assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm'), K = require('../api/_lib/kit'), n = 0;
var ROOT = path.join(__dirname, '..');
function t(name, fn) { fn(); n++; console.log('PASS ' + name); }
t('every item has an address, an audience and a kind; org items carry ?org=', function () {
  var k = K.forOrg('cleancell.us', { name: 'Clean Cell' });
  assert.equal(k.items.length, K.ITEMS.length);
  k.items.forEach(function (i) { assert.ok(/^https:\/\/silmarillion\.clearskyomega\.com\//.test(i.url), i.key); assert.ok(['plant', 'office', 'customer'].indexOf(i.audience) >= 0, i.key); assert.ok(['app', 'page', 'desktop'].indexOf(i.kind) >= 0, i.key); });
  assert.ok(/\?org=cleancell\.us$/.test(k.items.filter(function (i) { return i.key === 'customer-app'; })[0].url));
  assert.ok(!/org=/.test(k.items.filter(function (i) { return i.key === 'bench'; })[0].url), 'the bench is paired, not scoped by org in the URL');
});
t('the three phone apps each have a sandbox and a guide; every guide is a PDF under /guides/', function () {
  var k = K.forOrg('cleancell.us', {});
  ['plant-app', 'office-app', 'customer-app'].forEach(function (key) { var i = k.items.filter(function (x) { return x.key === key; })[0]; assert.ok(/\/app-sandbox\//.test(i.sandbox), key); assert.ok(/\/guides\/Omega-Logic-.*\.pdf$/.test(i.guide), key); assert.equal(i.install, 'home-screen'); });
  assert.equal(k.guides.length, 4); k.guides.forEach(function (g) { assert.ok(/^https:\/\/silmarillion\.clearskyomega\.com\/guides\/.*\.pdf$/.test(g.url)); });
});
/* The Omega Logic app guide is written by build.js under two names (the
   old Omega-Logic-Office-App.pdf and Omega-Logic-App.pdf); the kit links
   whichever is committed, and it must be a name build.js writes (guard.js GUIDES/ALSO). */
t('the office guide is the Omega Logic app guide, and the office app and the desktop office both point at it', function () {
  var g = K.GUIDES.filter(function (x) { return x.audience === 'office'; });
  assert.equal(g.length, 1, 'one office guide'); assert.ok(/^\/guides\/Omega-Logic-(Office-)?App\.pdf$/.test(g[0].path), g[0].path);
  ['office-app', 'office-desktop'].forEach(function (key) { assert.equal(K.ITEMS.filter(function (i) { return i.key === key; })[0].guide, g[0].path, key); });
  /* the names build.js writes are guard.js GUIDES and ALSO (one list; tguides.js judges the same) */
  var G = require(path.join(ROOT, 'scripts/guides/guard.js')), names = [];
  Object.keys(G.GUIDES).forEach(function (k) { names.push(G.GUIDES[k]); (G.ALSO[k] || []).forEach(function (n) { names.push(n); }); });
  K.GUIDES.forEach(function (x) { var file = x.path.replace(/^\/guides\//, ''); assert.ok(names.indexOf(file) >= 0, file + ' is not a name scripts/guides/build.js writes'); });
});
/* The PDFs are built by scripts/guides/build.js and committed under guides/:
   a guide the kit sends, or a Help menu links, must be a file that is there. */
t('every guide the kit names is a PDF on disk under guides/', function () {
  var paths = K.GUIDES.map(function (g) { return g.path; }).concat(K.ITEMS.map(function (i) { return i.guide; }).filter(Boolean));
  paths.forEach(function (p) { assert.ok(/^\/guides\/[A-Za-z0-9-]+\.pdf$/.test(p), p); assert.ok(fs.existsSync(path.join(ROOT, p)), p + ' is not built: run node scripts/guides/build.js'); });
});
t('every guide an app page links is on disk too (the old Omega-Logic-Office-App.pdf stays while a Help menu opens it)', function () {
  var pages = ['office/app.html', 'plant/app.html', 'portals/customer/app.html', 'portals/customer/index.html', 'omega-logic.html', 'logic-kit.html']
    .concat(fs.existsSync(path.join(ROOT, 'app-sandbox')) ? fs.readdirSync(path.join(ROOT, 'app-sandbox')).filter(function (f) { return /\.html$/.test(f); }).map(function (f) { return 'app-sandbox/' + f; }) : []);
  var seen = 0;
  pages.filter(function (f) { return fs.existsSync(path.join(ROOT, f)); }).forEach(function (f) {
    (fs.readFileSync(path.join(ROOT, f), 'utf8').match(/\/guides\/[A-Za-z0-9-]+\.pdf/g) || []).forEach(function (p) { seen++; assert.ok(fs.existsSync(path.join(ROOT, p)), f + ' links ' + p + ', which is not in guides/'); });
  });
  assert.ok(seen > 0, 'the office app\'s Help menu links its guides');
});
/* /guides is public and goes to every workspace: no guide's words name a
   tenant (build.js checks the printed PDF too; guard.js is the one list). */
t('no guide source names a tenant', function () {
  var LEAK = require('./guides/guard').LEAK, dir = path.join(ROOT, 'scripts/guides');
  fs.readdirSync(dir).filter(function (f) { return /\.html$/.test(f); }).forEach(function (f) {
    var src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/<!--[\s\S]*?-->/g, ' '), hit = src.match(LEAK);   /* words and links alike */
    assert.ok(!hit, 'scripts/guides/' + f + ' names a tenant: "' + (hit && hit[0]) + '"');
  });
});
t('an attached tenant hostname replaces the open host for org-scoped items only', function () {
  var k = K.forOrg('cleancell.us', { name: 'Clean Cell', host: 'cleancell.clearskyomega.com' });
  assert.equal(k.items.filter(function (i) { return i.key === 'office-app'; })[0].url, 'https://cleancell.clearskyomega.com/office/app?org=cleancell.us');
  assert.ok(/^https:\/\/silmarillion/.test(k.items.filter(function (i) { return i.key === 'office-app'; })[0].sandbox), 'sandboxes stay on the open host');
});
t('the message per audience names each item, how to install it, the sandbox and the guide to attach', function () {
  var k = K.forOrg('cleancell.us', { name: 'Clean Cell', brandName: 'Clean Cell Power Platform' }), m = K.message(k, 'customer');
  /* the customer's app is the supplier's own: its name, never "Omega Logic" */
  assert.ok(/^Here is your Clean Cell Power Platform account on your phone\./.test(m), m); assert.ok(!/Omega Logic|main system/.test(m.replace(/Omega-Logic-Customer-App\.pdf/g, '')), m);
  assert.ok(/Customer app: https/.test(m)); assert.ok(/Add to Home Screen/.test(m)); assert.ok(/app-sandbox\/customer/.test(m)); assert.ok(/Omega-Logic-Customer-App\.pdf/.test(m)); assert.ok(/Sign in: Email login link/.test(m));
  var other = K.message(K.forOrg('joules.example', { name: 'Joules', brandName: 'Joules Energy' }), 'customer');
  assert.ok(/^Here is your Joules Energy account/.test(other) && !/app-sandbox\/customer/.test(other), 'another supplier\'s customers are never sent the Clean Cell sample');
  var o = K.message(k, 'office'); assert.ok(/Omega Logic app: https/.test(o) && /Fleet register: https/.test(o) && /Omega-Logic-(Office-)?App\.pdf/.test(o), o);
  assert.ok(/Sign in: Work Google account, or work email and password/.test(o), 'the office signs in with Google or a work email and password (omega-logic-signin.js)');
  assert.ok(/Add to Home Screen/.test(o) && /On a computer:/.test(o) && /Install in the address bar/.test(o), 'the office is told how to install the app on a phone and on a computer');
  var pl = K.message(k, 'plant'); assert.ok(/Plant app: https/.test(pl) && /Bench scan station: https/.test(pl) && !/Customer app/.test(pl));
});
/* DOC-M7: the customer message is read by the supplier's customer, word for
   word. It carried lines written for the supplier ("For the buyer.", the
   website-button walkthrough) and called the Fleet tab by an old name. */
t('the customer message speaks to the customer: no notes for the supplier, no walkthrough, the tabs by their names', function () {
  var k = K.forOrg('cleancell.us', { name: 'Clean Cell', brandName: 'Clean Cell Power Platform' }), m = K.message(k, 'customer');
  assert.ok(!/For the buyer|\bbuyer\b|walkthrough|website button|recommended/i.test(m), m);
  assert.ok(!/Sites & equipment/.test(m) && /\bFleet\b/.test(m), 'the tab is Fleet (Home · Orders · POs · Fleet · Account)');
  K.ITEMS.filter(function (i) { return i.audience === 'customer'; }).forEach(function (i) {
    assert.ok(!/\bthe buyer\b|\bbuyer\b|the customer'?s?\b/i.test(i.what + ' ' + i.signin), i.key + ' is said to the customer, not about them: ' + i.what);
  });
  var g = K.GUIDES.filter(function (x) { return x.audience === 'customer'; })[0];
  assert.ok(!/Sites & equipment/.test(g.covers) && /Fleet/.test(g.covers), g.covers);
});
t('an item for the supplier\'s website stays on the kit page but is never in a message', function () {
  var k = K.forOrg('cleancell.us', { name: 'Clean Cell' }), start = k.items.filter(function (i) { return i.key === 'customer-start'; })[0];
  assert.ok(start && start.send === false && /customer-start\.html\?org=cleancell\.us$/.test(start.url), 'the walkthrough is still listed, marked not to send');
  ['plant', 'office', 'customer'].forEach(function (a) { assert.ok(!/customer-start/.test(K.message(k, a)), a + ' message'); });
  assert.ok(k.items.filter(function (i) { return i.key !== 'customer-start'; }).every(function (i) { return i.send === true; }), 'everything else is sent');
});
t('the customer is never pointed at the supplier\'s side', function () {
  var m = K.message(K.forOrg('cleancell.us', { name: 'Clean Cell', brandName: 'Clean Cell Power Platform' }), 'customer');
  assert.ok(!/app-sandbox\/(plant|office|bench)|\/plant\/|\/office\/|\/omega-logic|logic-/.test(m), m);
});
/* Safari on iOS 26 opens in the compact layout, where Share is inside the
   ••• menu at the end of the address bar: "tap Share" first sends an
   iPhone user looking for a button that is not there. */
t('the iPhone step matches Safari on iOS 26: ••• first, then Share, Add to Home Screen, Add', function () {
  ['phone', 'office'].forEach(function (key) {
    var s = K.INSTALL[key];
    assert.ok(/iPhone[^.]*•••[^.]*→ Share → Add to Home Screen → Add/.test(s), key + ': ' + s);
    assert.ok(s.indexOf('•••') < s.indexOf('Share'), key + ': ••• comes before Share');
    assert.ok(/if you see a Share button, tap it directly/.test(s), key + ': a phone set to another layout still has the button');
  });
});
/* D1 (2026-09-24): a workspace's owner or admin prices and accepts what it
   invoices itself; ClearSky prices what goes through ClearSky's QuickBooks.
   The kit said "pricing, acceptance" as if every office user had them. */
t('the office line says who prices and accepts, as decided', function () {
  var d = K.ITEMS.filter(function (i) { return i.key === 'office-desktop'; })[0].what;
  assert.ok(/owner or admin/.test(d) && /invoice yourselves/.test(d) && /ClearSky/.test(d), d);
  assert.ok(!/^The full system: pricing, acceptance/.test(d), 'no bare promise of pricing and acceptance');
  assert.ok(/owner or admin/.test(K.message(K.forOrg('cleancell.us', { name: 'Clean Cell' }), 'office')));
});

/* DOC-M7, CUST-12, CUST-13: the customer message links the customer
   sandbox, and its strip linked the plant, the office (the margin sheet,
   other companies' names) and the bench. The shim runs here on a stub page,
   as each app. */
function stripAs(app, links) {
  var src = fs.readFileSync(path.join(ROOT, 'scripts/_lib/app-sandbox-shim.js'), 'utf8'), on = {}, inserted = null, toasts = [];
  function el() { return { style: {}, remove: function () {}, appendChild: function () {} }; }
  var store = {}, page = {
    OMEGA_SANDBOX_APP: app, OMEGA_SANDBOX_LINKS: links, OMEGA_SANDBOX_TENANT: {},
    OmegaSandboxFixtures: { initialState: function () { return {}; }, views: function () { return {}; }, brand: {}, post: function () { return {}; } },
    localStorage: { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
    location: { pathname: '/app-sandbox/' + app, host: 'sandbox.test', href: 'https://sandbox.test/app-sandbox/' + app, reload: function () {} },
    setTimeout: function () {},
    document: {
      head: { appendChild: function () {} },
      body: { firstChild: null, insertBefore: function (d) { inserted = d; }, appendChild: function (d) { if (d.className === 'sb-toast') toasts.push(d.textContent); } },
      createElement: el, getElementById: function () { return {}; },
      addEventListener: function (type, fn) { on[type] = fn; }
    }
  };
  vm.runInNewContext(src, page);
  on.DOMContentLoaded();
  return {
    html: inserted.innerHTML, toasts: toasts,
    click: function (href) { var stopped = false; on.click({ target: { closest: function () { return { getAttribute: function () { return href; } }; } }, preventDefault: function () { stopped = true; } }); return stopped; }
  };
}
t('the customer sandbox strip links no plant, office or bench, and a link into them is not followed', function () {
  var c = stripAs('customer');
  assert.ok(!/app-sandbox\/(plant|office|bench)|>Plant<|>Office<|>Bench</.test(c.html), c.html);
  assert.ok(/Reset/.test(c.html) && /sample company account/.test(c.html), c.html);
  assert.ok(c.click('/app-sandbox/office') && c.click('/app-sandbox/plant?x=1') && c.click('/app-sandbox/bench') && c.click('/app-sandbox/office.html#orders'), 'a link a page carries into the supplier\'s side is stopped');
  assert.ok(/supplier/.test(c.toasts[0] || ''), 'and says why');
  assert.ok(!c.click('/app-sandbox/customer?tab=pos'), 'its own page still routes');
  var art = stripAs('customer', { plant: 'https://p.example/', office: 'https://o.example/', customer: 'https://c.example/', bench: 'https://b.example/' });
  assert.ok(!/p\.example|o\.example|b\.example/.test(art.html), 'nor as a published test link');
});
t('the supplier\'s own sandboxes still link each other and the customer app', function () {
  ['plant', 'office', 'bench'].forEach(function (app) {
    var s = stripAs(app);
    ['plant', 'office', 'customer', 'bench'].forEach(function (k) { assert.ok(s.html.indexOf('href="/app-sandbox/' + k + '"') >= 0, app + ' → ' + k); });
    assert.ok(/aria-current="page">/.test(s.html) && !s.click('/app-sandbox/office'), app);
  });
});
/* The customer's published test link carries no address of the supplier's
   side at all (scripts/build-app-sandbox.js artifactPage). */
t('the customer\'s published test link carries no link to the plant, office or bench', function () {
  var B = require('./build-app-sandbox'), os = require('os'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-art-'));
  try {
    var made = B.buildArtifacts(dir, { plant: 'https://plant.example/', office: 'https://office.example/', customer: 'https://customer.example/', bench: 'https://bench.example/' });
    var c = fs.readFileSync(path.join(made.customer, 'index.html'), 'utf8'), o = fs.readFileSync(path.join(made.office, 'index.html'), 'utf8');
    assert.ok(/OMEGA_SANDBOX_LINKS=\{\}/.test(c) && !/(plant|office|bench)\.example/.test(c), 'customer');
    assert.ok(/office\.example/.test(o) && /customer\.example/.test(o), 'the office link still carries them');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
console.log('\n' + n + ' kit checks passed');
