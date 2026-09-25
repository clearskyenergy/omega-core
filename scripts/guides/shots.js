#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   scripts/guides/shots.js — the screenshots the PDF guides print, taken
   from the sandboxes, the same way on every run.

   Every picture is the REAL page with nothing behind it. The phone apps are
   what scripts/build-app-sandbox.js builds, built in memory from the tree
   being photographed (so a sandbox that has not been rebuilt yet cannot put
   an old screen into a guide), answered on the page by the one sample
   tenant in scripts/_lib/logic-fixtures.js. The desktop office
   (omega-logic.html) runs on the same sandbox runtime: this server answers
   /config.js with sandbox.js and empties omega-brand.js / omega-tenant.js,
   as scripts/render-logic-pages.js stubs them. Nothing leaves the machine:
   a request that is not for the local server is refused, so the pages fall
   back to system fonts, as the committed shots always have.

   /guides is public and goes to every subscriber, so NO PICTURE NAMES A
   TENANT. The sample workspace is shown as "Your Company" (the Omega Logic
   app, the plant, and the customer app as the office sees it) or as "Your
   Supplier" (the customer guide, which the supplier's customers read); the
   SKUs, serials and sample customers are neutral too (NEUTRAL below), and a
   shot whose visible text still carries a tenant name (guard.js) or a name
   scripts/_lib/discreet.js matches fails. The clock is
   fixed (AT), so a date on a screen is the same on every run.

   Each shot is a fresh browser context (its own storage, the sample from
   the start), so any one can be retaken alone. Each waits for a concrete
   selector and fails BY NAME if it never appears; the run carries on and
   exits 1 with the list of failures. Every picture that passes is recorded
   in <out>/manifest.json (guard.js): build.js prints no picture that is not
   in it, so a leftover capture from before this script cannot reach a PDF.
   Retake EVERY shot (no --only) whenever the screens change; --only is for
   one picture that failed.

     node scripts/guides/shots.js                   # every shot → scripts/guides/shots/
     node scripts/guides/shots.js --only office-hub,bench
     node scripts/guides/shots.js --list            # the names and what each shows
     node scripts/guides/shots.js --root <checkout> --out <dir>
                                                    # photograph another tree, read
                                                    # only (--out is then required)
   then  node scripts/guides/build.js

   Playwright: $PLAYWRIGHT, else this repo's, else the sandbox's global copy.
   Chromium: $CHROME, else the sandbox's pinned build, else Playwright's. */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process'), Guard = require('./guard');
/* the real buyer's company, people and PO code, matched by hash (the one
   matcher tdiscreet.js uses): never on a published picture either */
var Discreet = require('../_lib/discreet');

var HERE = __dirname, OWN_ROOT = path.resolve(HERE, '..', '..');
function arg(name) { var i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }
var ROOT = path.resolve(arg('--root') || OWN_ROOT);
if (ROOT !== OWN_ROOT && !arg('--out')) { console.error('shots: pass --out <dir> with --root ' + ROOT + ' — another tree\'s shots must not overwrite ' + path.join(HERE, 'shots')); process.exit(2); }
var OUT = path.resolve(arg('--out') || path.join(HERE, 'shots')), ONLY = arg('--only');

/* ── what the pictures show instead of the sample tenant ────────────────── */
var AT = '2026-09-24T16:00:00Z', TZ = 'America/Chicago';   /* the sample's dates are September 2026 */
var WHO = { company: { brand: 'Your Company', domain: 'yourcompany.com' }, supplier: { brand: 'Your Supplier', domain: 'yoursupplier.com' } };
var CUSTOMER = 'ops@riverside.example';                      /* the sample's buyer (fixtures) */
var NEUTRAL = function (w) {
  return [['Clean Cell Power Platform', w.brand], ['Clean Cell', w.brand], ['Cleancell', w.brand],
    ['robert.bucher@cleancell.us', 'support@' + w.domain], ['cleancell.us', w.domain],
    ['/cleancell/', '/' + w.domain.split('.')[0] + '/'], ['DEMOCLEANCELL', 'DEMO']];   /* the sample's pay links; its customers are neutral names already (logic-fixtures.js) */
};
/* what must never be readable on a published picture: the one list, in guard.js */
var LEAK = Guard.LEAK;
function neutral(s, who) {
  NEUTRAL(WHO[who]).forEach(function (r) { s = s.split(r[0]).join(r[1]); });
  return s.replace(/\bCC(?=-|418-)/g, 'EX');                 /* CC-C215, CC-26-4419, CC418-26-44190 */
}
var SERIAL = 'EX418-26-44195';                               /* the cabinet on the sample's benches (logic-fixtures.js WORKING), after neutral() */
/* a customer's list of sites as it comes in an email (the greeting and the
   sign-off are left out by the reader; x2 is a count) */
var SITE_LIST = 'Hi, please send the batteries on our PO to these stores:\n\n'
  + '- 410 Example Ave, Fairview, NJ 07022\n'
  + '- 77 Sample Plaza Suite 12, Springfield, IL 62704 x2\n'
  + '- Store 12: 1200 Demo Pkwy, Madison, WI 53703\n'
  + '- 55 Fictional Way, Portland, ME 04101\n\nThanks,\nDana';

/* ── the shots ──────────────────────────────────────────────────────────── */
var PHONE = { width: 390, height: 780, scale: 2 }, DESKTOP = { width: 1280, height: 800, scale: 2 };
/* a desktop page whose point is further down than 800 px shows: taller */
var DESKTOP_TALL = { width: 1280, height: 1000, scale: 2 }, PHONE_TALL = { width: 390, height: 960, scale: 2 };
async function openAccount(p, h, sec) {
  await h.click('#nav [data-tab="customers"]');
  await h.click('#cust-body [data-cust="company_riverside"]');
  await h.wait('#cust-seg [data-sec="overview"]');
  if (sec) { await h.click('#cust-seg [data-sec="' + sec + '"]'); await h.wait('#cust-seg [data-sec="' + sec + '"][aria-pressed="true"]'); }
}
/* The customer's sites: the Fleet tab where the app has one, else the
   Sites section of the Account tab. */
async function customerSites(p, h) {
  var fleet = !!(await p.$('#nav [data-tab="fleet"]'));
  await h.click('#nav [data-tab="' + (fleet ? 'fleet' : 'account') + '"]');
  await h.wait('#sites-body [data-dest="0"]');
}
/* The customer names the site its unit is going to and records it
   received: the state the office then sees under "The customer says" */
async function customerDeclares(p, h) {
  await customerSites(p, h);
  var site = await p.$eval('#sites-body [data-dest="0"]', function (s) { var o = Array.prototype.filter.call(s.options, function (x) { return x.value; })[0]; return o ? o.value : ''; });
  if (!site) throw new Error('no site in the sample to send the unit to');
  await p.selectOption('#sites-body [data-dest="0"]', site);
  /* each unit card says what happened on its own line (CUST-08) */
  await h.click('#sites-body [data-act="destination"]'); await h.text('#sites-body [data-umsg]', /is going to/);
  await h.click('#sites-body [data-act="received"]'); await h.text('#sites-body [data-umsg]', /^Recorded/);
}
/* The sample cabinet on the benches (SERIAL) is at Rack assembly. Build it
   to BMS & firmware the way the bench does — the same /api/mes-scan calls a
   roaming phone makes: issue the rack's parts, tick its check, scan it in at
   each bench, load the firmware — so the next bench is the EOL test. */
async function benchToBms(p) {
  var said = await p.evaluate(function (serial) {
    function scan(b) { b.stationId = 'st-phone'; return fetch('/api/mes-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(function (r) { return r.json(); }); }
    var calls = [{ action: 'issue', station: 'rack', serial: serial, code: 'EX-MOD-52', qty: 8 }, { action: 'issue', station: 'rack', serial: serial, code: 'EX-HARN', qty: 2.5 },
      { action: 'step-done', station: 'rack', serial: serial, stepId: 'check-torque-busbars' }, { station: 'encl', serial: serial }, { station: 'elec', serial: serial }, { station: 'bms', serial: serial },
      { action: 'step-done', station: 'bms', serial: serial, stepId: 'check-load-firmware' }];
    return calls.reduce(function (pr, b) { return pr.then(function (out) { return scan(b).then(function (r) { out.push(!!r.ok + ' ' + (r.say || r.error || '')); return out; }); }); }, Promise.resolve([]));
  }, SERIAL);
  var bad = said.filter(function (x) { return !/^true/.test(x); });
  if (bad.length) throw new Error('the bench refused the sample unit: ' + bad.join(' | '));
}
var SHOTS = [
  /* the Omega Logic app — guides/Omega-Logic-App.pdf */
  { name: 'office-hub', page: '/app-sandbox/office', who: 'company', signIn: 'staff', ready: '#hubs .hexhub [data-hub="sales"]', what: 'Home: the hex hub with its badges, top of the page',
    steps: async function (p, h) { await h.wait('#today-kv'); } },
  { name: 'office-hub-panels', page: '/app-sandbox/office', who: 'company', signIn: 'staff', ready: '#hub-open', what: 'Home scrolled to the panels under the hub, Sales open',
    steps: async function (p, h) { await h.wait('#today-kv'); await h.click('#hub-panels [data-hpanel="sales"]'); await h.wait('#hub-open'); await h.settle(); await h.scrollTo('#hub-panels'); } },
  { name: 'office-customers', page: '/app-sandbox/office', who: 'company', signIn: 'staff', ready: '#cust-body [data-cust]', what: 'the Customers tab: the account list',
    steps: async function (p, h) { await h.click('#nav [data-tab="customers"]'); } },
  { name: 'office-account', page: '/app-sandbox/office', who: 'company', signIn: 'staff', ready: '#cust-seg [data-sec="overview"]', what: 'one customer account, Overview',
    steps: async function (p, h) { await openAccount(p, h); await h.soft('#quick'); } },
  { name: 'office-activity', page: '/app-sandbox/office', who: 'company', signIn: 'staff', ready: '#lg-go', what: 'the same account, Activity: log a call, set a follow-up',
    steps: async function (p, h) { await openAccount(p, h, 'activity'); } },
  { name: 'office-documents', page: '/app-sandbox/office', who: 'company', signIn: 'staff', ready: '#doc-go', what: 'the same account, Documents: upload, share with the customer, the list',
    steps: async function (p, h) { await openAccount(p, h, 'documents'); await h.soft('#cust-body [data-doc-get]'); await h.settle(); await h.scrollTo('#doc-note'); } },
  { name: 'office-order', page: '/app-sandbox/office', who: 'company', signIn: 'staff', ready: '#back', what: 'the Orders tab with one order open',
    steps: async function (p, h) { await h.click('#nav [data-tab="orders"]'); await h.click('#view [data-order="o1"]'); await h.soft('#view [data-resolve]'); } },
  /* the customer places its unit first (same browser, same sample), so the
     office's Sites tab has one to Confirm, as the guide describes */
  { name: 'office-sites', page: '/app-sandbox/customer', who: 'company', signIn: 'customer', ready: '#su-serial', what: 'the Sites tab: a unit the customer placed, waiting for Confirm',
    steps: async function (p, h) {
      await customerDeclares(p, h);
      await p.goto(new URL(p.url()).origin + '/app-sandbox/office', { waitUntil: 'domcontentloaded' });
      await signIn(p, h, 'staff');
      await h.click('#nav [data-tab="sites"]'); await h.wait('[data-confirm]');
    } },
  { name: 'office-menu', page: '/app-sandbox/office', who: 'company', signIn: 'staff', ready: '#qsearch', what: 'the Menu, Sales panel open',
    steps: async function (p, h) { await h.click('#nav [data-tab="menu"]'); await h.click('#view [data-panel="sales"]'); } },
  { name: 'office-scan', page: '/app-sandbox/office', who: 'company', signIn: 'staff', ready: '#su-cam', what: 'the Sites tab scrolled to Receive a load and the unit passport, each with its Camera button',
    steps: async function (p, h) { await h.click('#nav [data-tab="sites"]'); await h.wait('#rc-scan'); await h.settle(); await h.scrollTo('#view h2', /^Receive a load/); } },
  { name: 'office-passport', page: '/app-sandbox/office', who: 'company', signIn: 'staff', ready: '#su-body h2', what: 'the unit passport opened from Sites: custody, site, coverage, the moves that apply, history',
    steps: async function (p, h) { await h.click('#nav [data-tab="sites"]'); await h.wait('#su-serial'); await p.fill('#su-serial', 'EX418-26-44192'); await h.click('#su-go'); await h.wait('#su-body h2'); await h.settle(); await p.evaluate(function () { window.scrollTo(0, 0); }); } },
  { name: 'desktop-office', page: '/omega-logic?org=' + WHO.company.domain, who: 'company', signIn: 'desktop', view: DESKTOP, ready: '#hub [data-hub], .logic-flow a', what: 'the desktop office (omega-logic.html) in a 1280×800 window, hub at the top',
    steps: async function (p, h) { if (await p.evaluate(function () { return !!window.OmegaHexHub; })) await h.wait('#hub .hexhub [data-hub]'); } },
  { name: 'customer-app', page: '/app-sandbox/customer', who: 'company', signIn: 'customer', ready: '#hub .hexhub [data-hub]', what: 'the supplier\'s customer app, home (its hub), as the office sees it' },
  /* the desktop pages the app sends a person to, in a 1280×800 window, signed
     in as the sample's office administrator (session: no sign-in screen) */
  { name: 'desktop-price', page: '/omega-logic?org=' + WHO.company.domain + '&order=o3', who: 'company', signIn: 'desktop', view: DESKTOP, ready: '[data-action="price"][data-accept]', what: 'the desktop office, an order waiting for its price: Approve price & accept order',
    steps: async function (p, h) { await h.wait('#quoteTotal'); await p.fill('#quoteTotal', '2012500'); await h.settle(); await h.scrollTo('#detail h2'); } },
  { name: 'desktop-accounting', page: '/logic-accounting.html?org=' + WHO.company.domain, who: 'company', signIn: 'session', view: DESKTOP, ready: '#paystate [data-act="record"]', what: 'Accounting with one invoice open: the Payment box says it is not received yet, with Mark as received',
    steps: async function (p, h) { await h.click('#ledger [data-open$=":balance"]'); } },
  { name: 'desktop-accounting-void', page: '/logic-accounting.html?org=' + WHO.company.domain, who: 'company', signIn: 'session', view: DESKTOP, ready: '#dlg-void:not([hidden]) #after-keep', what: 'Accounting: Mark as not received on a paid deposit — the reason, and keep building on the PO or hold the order',
    steps: async function (p, h) { await h.click('#ledger [data-open$="o1:deposit"]'); await h.click('#paystate [data-act="void"]'); await h.wait('#void-choice:not([hidden])'); await p.fill('#void-reason', 'The wire was returned by the bank'); await p.check('#after-keep'); } },
  { name: 'desktop-team', page: '/logic-team.html?org=' + WHO.company.domain, who: 'company', signIn: 'session', view: DESKTOP_TALL, ready: '#add-go', what: 'Team: add a person, the people with their roles, Disable',
    steps: async function (p, h) { await p.fill('#add-email', 'jordan@' + WHO.company.domain); await p.fill('#add-name', 'Jordan Lee'); } },
  { name: 'desktop-sites-list', page: '/logic-custody.html?org=' + WHO.company.domain + '#many', who: 'company', signIn: 'session', view: DESKTOP_TALL, ready: '#mn-create', what: 'Sites & custody → Many sites at once: a customer\'s emailed list read line by line, before Create sites',
    steps: async function (p, h) {
      await h.wait('#mn-acct option[value="company_riverside"]', 'attached'); await p.selectOption('#mn-acct', 'company_riverside'); await h.wait('#mn-steps:not(.hide)');
      await p.fill('#mn-text', SITE_LIST); await h.click('#mn-check'); await h.wait('#mn-preview [data-mn-name]'); await h.settle();
    }, clip: ['#mn-step1 h3', '#mn-create'] },
  { name: 'desktop-sites-send', page: '/logic-custody.html?org=' + WHO.company.domain + '#many', who: 'company', signIn: 'session', view: DESKTOP_TALL, ready: '#mn-apply', what: 'the same list after Create sites: the order\'s units spread over the sites, previewed serial by serial',
    steps: async function (p, h) {
      await h.wait('#mn-acct option[value="company_riverside"]', 'attached'); await p.selectOption('#mn-acct', 'company_riverside'); await h.wait('#mn-steps:not(.hide)');
      await p.fill('#mn-text', SITE_LIST); await h.click('#mn-check'); await h.wait('#mn-preview [data-mn-name]');
      await h.click('#mn-create'); await h.text('#mn-msg1', /Created/); await h.wait('#mn-sites [data-mn-on]');
      await h.click('#mn-plan'); await h.wait('#mn-planout .sum'); await h.settle();
    }, clip: ['#mn-step3 h3', '#mn-apply'] },

  /* the plant — guides/Omega-Logic-Plant-App.pdf */
  { name: 'plant-today', page: '/app-sandbox/plant', who: 'company', signIn: 'staff', ready: '#today-kv', what: 'the Plant app, Today' },
  { name: 'plant-work', page: '/app-sandbox/plant', who: 'company', signIn: 'staff', ready: '#view .strip', what: 'a work order open',
    steps: async function (p, h) { await h.click('#nav [data-tab="work"]'); await h.click('#view [data-wo="wo_1"]'); } },
  { name: 'plant-unit', page: '/app-sandbox/plant', who: 'company', signIn: 'staff', ready: '#view h1.mono', what: 'a held unit from Quality',
    steps: async function (p, h) { await h.click('#nav [data-tab="quality"]'); await h.click('#view [data-unit]'); } },
  { name: 'bench', page: '/app-sandbox/bench', who: 'company', ready: '#work.on', what: 'the bench: a roaming phone at Rack assembly, the serial typed with Type a serial, the unit\'s steps and parts',
    steps: async function (p, h) { await h.wait('#pick option[value="rack"]', 'attached'); await p.selectOption('#pick', 'rack'); await h.click('#typeBtn'); await h.wait('#typed'); await p.fill('#typed', SERIAL); await h.click('#typed-go'); } },
  { name: 'bench-type', page: '/app-sandbox/bench', who: 'company', ready: '#typebox:not([hidden]) #typed-go', what: 'the bench with Type a serial open, a serial typed, before Go',
    steps: async function (p, h) { await h.wait('#pick option[value="rack"]', 'attached'); await p.selectOption('#pick', 'rack'); await h.click('#typeBtn'); await h.wait('#typed'); await p.fill('#typed', SERIAL); } },
  { name: 'plant-test', page: '/app-sandbox/plant', who: 'company', signIn: 'staff', ready: '#t-save', what: 'the Plant app, a unit at BMS & firmware whose next bench is the EOL test: Record the result by hand, filled in',
    steps: async function (p, h) {
      await benchToBms(p);
      await h.click('#nav [data-tab="scan"]'); await h.wait('#find'); await p.fill('#find', SERIAL); await h.click('#find-go'); await h.wait('#t-save');
      await p.check('input[name="t-res"][value="pass"]'); await p.fill('#t-note', 'Insulation 520 MOhm and pack voltage on the bench meter; the EOL rig is offline');
      await h.settle(); await h.scrollTo('#view h2', /^Test result/);
    } },
  { name: 'plant-register', page: '/plant/index.html?org=' + WHO.company.domain, who: 'company', signIn: 'session', view: DESKTOP, ready: '#batch-rows .brow', what: 'Work orders & registration → Register serials: serials pasted one per line against the work order, the batch as rows',
    steps: async function (p, h) {
      await h.wait('#destination option[value="wo_1"]', 'attached'); await p.click('#register-panel summary'); await h.wait('#paste');
      await p.selectOption('#destination', 'wo_1');
      await p.fill('#paste', 'EX418-26-44196\nEX418-26-44197\nEX418-26-44198'); await h.click('#paste-add'); await h.settle();
    }, clip: ['#register-panel summary', '#register'] },

  /* the customer app — guides/Omega-Logic-Customer-App.pdf (read by the supplier's customers) */
  { name: 'customer-home', page: '/app-sandbox/customer', who: 'supplier', signIn: 'customer', ready: '#hub .hexhub [data-hub]', what: 'Home: the hub, as the customer sees it' },
  { name: 'customer-signin', page: '/app-sandbox/customer', who: 'supplier', installed: true, view: PHONE_TALL, ready: '#ols-installed', what: 'the sign-in in the app on an iPhone Home Screen: Google, email and password, First time here? Create a password — no emailed link' },
  { name: 'customer-sitelist', page: '/app-sandbox/customer', who: 'supplier', signIn: 'customer', ready: '#sl-create', what: 'Fleet → Sites from a list: the pasted email read as one card per line, before Create',
    steps: async function (p, h) { await customerSites(p, h); await h.click('[data-go="sitelist"]'); await h.wait('#sl-text'); await p.fill('#sl-text', SITE_LIST); await h.click('#sl-preview'); await h.wait('[data-sl-row]'); await h.settle(); await h.scrollTo('#sl-body'); } },
  { name: 'customer-sitelist-send', page: '/app-sandbox/customer', who: 'supplier', signIn: 'customer', ready: '#sl-apply', what: 'the same list after Create: step 3, the order\'s units spread over the sites, previewed',
    steps: async function (p, h) {
      await customerSites(p, h); await h.click('[data-go="sitelist"]'); await h.wait('#sl-text'); await p.fill('#sl-text', SITE_LIST); await h.click('#sl-preview'); await h.wait('[data-sl-row]');
      await h.click('#sl-create'); await h.wait('#sl-plan'); await h.click('#sl-plan'); await h.wait('#sl-planbox'); await h.settle(); await h.scrollTo('#sl-planbox');
    } },
  { name: 'customer-design', page: '/app-sandbox/customer?tab=design', who: 'supplier', signIn: 'customer', ready: '#design-body .card', what: 'Design: Editor Lite and the site plans' },
  { name: 'customer-orders', page: '/app-sandbox/customer', who: 'supplier', signIn: 'customer', ready: '#view .card', what: 'Orders: the order with its milestone',
    steps: async function (p, h) { await h.click('#nav [data-tab="orders"]'); } },
  { name: 'customer-pos', page: '/app-sandbox/customer', who: 'supplier', signIn: 'customer', ready: '#bulk-text', what: 'POs: rows pasted from a spreadsheet (tabs, with its header row), read as two POs',
    steps: async function (p, h) {
      await h.click('#nav [data-tab="pos"]'); await h.wait('#bulk-text');
      await p.fill('#bulk-text', ['PO number\tSKU\tQty\tShip to\tAddress\tCity\tState\tZIP\tRequested\tNotes', 'PO-1001\tEX-C215\t2\tStore 12\t1200 Demo Pkwy\tMadison\tWI\t53703\t2026-11-16\tDock B, call ahead', 'PO-1002\tEX-C215\t1\tFairview\t410 Example Ave\tFairview\tNJ\t07022\t2026-11-20\t'].join('\n'));
      await h.text('#bulk-preview', /purchase order/); await h.settle();
    } },
  { name: 'customer-sites', page: '/app-sandbox/customer', who: 'supplier', signIn: 'customer', ready: '#sites-body [data-dest="0"]', what: 'Sites & equipment: a unit on its way, before the customer names its site',
    steps: async function (p, h) { await customerSites(p, h); await h.settle(); await h.scrollTo('#view h2', /^Sites/); } },
  { name: 'customer-sites-2', page: '/app-sandbox/customer', who: 'supplier', signIn: 'customer', ready: '#sites-body h2', what: 'the same unit after the customer names its site and records it received',
    steps: async function (p, h) {
      await customerDeclares(p, h);
      await h.settle(); await h.scrollTo('#view [data-go="warranty"]');   /* the page ends before "Your units" reaches the top: start at the whole row of buttons, not a sliver of it */
    } }
];

/* ── the CRM, where the sandbox does not answer it yet ─────────────────────
   Appended to sandbox.js only when the shim has no /api/crm of its own; it
   answers in the shape api/crm.js returns (api/_lib/crm.js contactView,
   activityView, fileView, followUpView, timeline). Runs in the page. */
function crmSample() {
  var real = window.fetch, DAY = 864e5, me = window.OMEGA_SANDBOX_STAFF || 'you@yourcompany.com';
  function at(d, h) { return new Date(Date.now() + d * DAY + (h || 0) * 36e5).toISOString(); }
  var FU = { id: 'a1', activityId: 'a1', customerId: 'company_riverside', company: 'Riverside Cold Chain', type: 'call', subject: 'Delivery window for the yard', followUpAt: at(0).slice(0, 10), contactId: 'ct1', contactName: 'Jordan Lee', orderId: 'o1', by: me, at: at(-1) };
  var ACCOUNTS = { company_riverside: {
    company: 'Riverside Cold Chain',
    contacts: [{ id: 'ct1', name: 'Jordan Lee', title: 'Site lead', email: 'jordan@riverside.example', phone: '+1 555 0100', notes: 'Prefers a call before 10 am', primary: true, archived: false },
      { id: 'ct2', name: 'Priya Shah', title: 'Accounts payable', email: 'ap@riverside.example', phone: '', notes: '', primary: false, archived: false }],
    activity: [{ id: 'a1', type: 'call', subject: 'Delivery window for the yard', body: 'Tuesday morning works; use dock B.', at: at(-1), followUpAt: FU.followUpAt, contactId: 'ct1', contactName: 'Jordan Lee', orderId: 'o1', orderNo: 'EX-26-4419', by: me, done: false, open: true },
      { id: 'a2', type: 'email', subject: 'Sent the cabinet datasheet', body: '', at: at(-3), followUpAt: null, contactId: 'ct1', contactName: 'Jordan Lee', orderId: null, orderNo: null, by: me, done: false, open: false }],
    followUps: [FU],
    files: [{ id: 'f1', name: 'Site survey.pdf', type: 'application/pdf', size: 420000, category: 'site-survey', note: '', from: 'customer', source: 'customer', shared: true, uploadedAt: at(-2), uploadedBy: 'ops@riverside.example', archived: false },
      { id: 'f2', name: 'Supply agreement.pdf', type: 'application/pdf', size: 180000, category: 'contract', note: 'Signed copy', from: 'office', source: 'office', shared: true, uploadedAt: at(-6), uploadedBy: me, archived: false }],
    timeline: [{ at: at(-1), kind: 'activity', title: 'Call: Delivery window for the yard', detail: 'Tuesday morning works; use dock B.', by: me },
      { at: at(-2), kind: 'document', title: 'Site survey.pdf uploaded by the customer', detail: '', by: 'ops@riverside.example' },
      { at: at(-6), kind: 'document', title: 'Supply agreement.pdf shared with the customer', detail: 'Signed copy', by: me },
      { at: at(-23), kind: 'order-placed', title: 'Order EX-26-4419 placed · PO RCC-2200', detail: '5 × 215 kWh outdoor cabinet', by: 'ops@riverside.example', orderId: 'o1' }] } };
  function json(o, status) { return Promise.resolve(new Response(JSON.stringify(o), { status: status || 200, headers: { 'Content-Type': 'application/json' } })); }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '', a = document.createElement('a'); a.href = url;
    if (a.host !== location.host || a.pathname !== '/api/crm') return real.apply(this, arguments);
    if (init && init.method && init.method.toUpperCase() !== 'GET') return json({ ok: true, note: 'Saved (sample).' });
    var q = a.search.slice(1), id = decodeURIComponent((/(?:^|&)customerId=([^&]*)/.exec(q) || [])[1] || '');
    if (/(?:^|&)followUps=(1|true)/.test(q)) return json({ followUps: [FU] });
    if (/(?:^|&)file=/.test(q)) return json({ error: 'Not in this sandbox: a document\'s bytes' }, 404);
    var c = ACCOUNTS[id] || { company: '', contacts: [], activity: [], followUps: [], files: [], timeline: [] };
    return json(Object.assign({ customerId: id, status: 'active', canEdit: true, canArchive: true, limited: false }, c));
  };
}

/* ── Accounting, which the sandbox does not answer ─────────────────────────
   Appended to sandbox.js when the shim has no /api/logic-accounting of its
   own: GET is the sample's own receivables ledger, built by the fixtures'
   accountingJson (api/_lib/receivables.js, bundled) from the sandbox's
   state, exactly what scripts/render-logic-pages.js serves the page. A
   write is not needed for a picture. Runs in the page. */
function accountingSample() {
  var real = window.fetch;
  function json(o) { return Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })); }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '', a = document.createElement('a'); a.href = url;
    if (a.host !== location.host || a.pathname !== '/api/logic-accounting') return real.apply(this, arguments);
    if (init && init.method && init.method.toUpperCase() !== 'GET') return json({ ok: true });
    return json(window.OmegaSandboxFixtures.views(window.OMEGA_SANDBOX.state()).accountingJson(a.search.slice(1)));
  };
}

/* ── the sandbox, from the tree being photographed ─────────────────────── */
function sandboxFiles() {
  try { return { files: require(path.join(ROOT, 'scripts/build-app-sandbox.js')).build(null), from: 'built in memory from ' + ROOT }; }
  catch (e) {
    var dir = path.join(ROOT, 'app-sandbox'), files = {};
    console.warn('shots: could not build the sandbox from ' + ROOT + ' (' + e.message + '); using the committed ' + dir + '/, which may be stale');
    fs.readdirSync(dir).forEach(function (f) { files[f] = fs.readFileSync(path.join(dir, f), 'utf8'); });
    return { files: files, from: dir };
  }
}
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf', '.woff2': 'font/woff2' };
/* one server per "who", so a page and the sandbox it loads always agree */
function serve(files, who) {
  var crm = (/['"]\/api\/crm['"]/.test(files['sandbox.js']) ? '' : '\n;(' + crmSample.toString() + ')();\n')
    + (/['"]\/api\/logic-accounting['"]/.test(files['sandbox.js']) ? '' : '\n;(' + accountingSample.toString() + ')();\n'), cache = {};
  function sandboxed(name) { if (!(name in cache)) cache[name] = neutral(files[name], who) + (name === 'sandbox.js' ? crm : ''); return cache[name]; }
  var s = http.createServer(function (req, res) {
    var u = decodeURIComponent(req.url.split('?')[0]), body = null, ext;
    if (u.indexOf('/app-sandbox/') === 0) {
      var name = u.slice(13); if (!path.extname(name)) name += '.html';
      if (Object.prototype.hasOwnProperty.call(files, name)) { ext = path.extname(name); body = /\.(html|js)$/.test(name) ? sandboxed(name) : files[name]; }
    } else if (u === '/config.js') { ext = '.js'; body = sandboxed('sandbox.js'); }         /* every page here runs on the sandbox runtime */
    else if (u === '/omega-brand.js' || u === '/omega-tenant.js') { ext = '.js'; body = '/* sandbox: no tenant runtime */'; }
    else {
      var f = path.join(ROOT, path.normalize(u === '/' ? '/index.html' : u));
      if (f.indexOf(ROOT + path.sep) === 0) {
        if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';                  /* Vercel clean URLs */
        if (fs.existsSync(f) && fs.statSync(f).isFile()) { ext = path.extname(f); body = fs.readFileSync(f); if (ext === '.html') body = neutral(body.toString(), who); }
      }
    }
    if (body === null) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body);
  });
  return new Promise(function (resolve) { s.listen(0, '127.0.0.1', function () { resolve(s); }); });
}

/* ── helpers bound to one shot, so a failure names it ──────────────────── */
var WAIT = 10000;
function helpers(p, name) {
  var h = {};
  h.wait = async function (sel, state) {
    try { await p.waitForSelector(sel, { state: state || 'visible', timeout: WAIT }); }
    catch (e) { throw new Error('"' + sel + '" never appeared (' + WAIT / 1000 + ' s)'); }
  };
  h.click = async function (sel) { await h.wait(sel); await p.click(sel); };
  /* a nice-to-have on the screen: waited for, never fatal */
  h.soft = async function (sel) { try { await p.waitForSelector(sel, { timeout: 3000 }); } catch (e) { console.warn('  ' + name + ': "' + sel + '" did not appear; shooting without it'); } };
  h.text = async function (sel, re) {
    try { await p.waitForFunction(function (a) { var el = document.querySelector(a.sel); return !!el && new RegExp(a.re).test(el.textContent || ''); }, { sel: sel, re: re.source }, { timeout: WAIT }); }
    catch (e) { throw new Error(sel + ' never said ' + re + ' (' + WAIT / 1000 + ' s)'); }
  };
  /* quiet: no DOM change for ~350 ms (counted in timer ticks, since the
     clock is fixed), at most ~5 s; then the fonts */
  h.settle = async function () {
    await p.evaluate(function () {
      return new Promise(function (done) {
        var quiet = 0, ticks = 0, mo = new MutationObserver(function () { quiet = 0; });
        mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
        (function tick() { quiet++; ticks++; if (quiet >= 7 || ticks >= 100) { mo.disconnect(); done(); } else setTimeout(tick, 50); })();
      }).then(function () { return document.fonts ? document.fonts.ready : null; }).then(function () { return null; });
    });
  };
  /* put an element just under the sticky header (optionally the first of
     `sel` whose text matches `re`); the pages scroll smoothly, so wait for
     that to finish first */
  h.scrollTo = async function (sel, re) {
    await p.waitForTimeout(450);
    var found = await p.evaluate(function (a) {
      var list = Array.prototype.slice.call(document.querySelectorAll(a.sel)), el = a.re ? list.filter(function (x) { return new RegExp(a.re).test((x.textContent || '').trim()); })[0] : list[0];
      if (!el) return false;
      var head = 0;
      Array.prototype.forEach.call(document.querySelectorAll('body *'), function (e) { var cs = getComputedStyle(e); if (cs.position !== 'sticky' && cs.position !== 'fixed') return; var r = e.getBoundingClientRect(); if (r.top <= 1 && r.bottom > 0 && r.height < innerHeight / 2) head = Math.max(head, r.bottom); });
      window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - head - 12), behavior: 'instant' });
      return true;
    }, { sel: sel, re: re ? re.source : null });
    if (!found) throw new Error('nothing to scroll to: "' + sel + '"' + (re ? ' matching ' + re : ''));
  };
  return h;
}
/* how a shot signs in: 'staff' the app's Google button, 'customer' the
   customer app's email, 'desktop' the desktop office's Google button, and
   'session' already signed in (the sandbox's remembered user is set before
   the page loads: a desktop page with no sign-in screen of its own) */
async function signIn(p, h, how) {
  if (how === 'session') return;
  if (how === 'customer') { await h.wait('#g-email'); await p.fill('#g-email', CUSTOMER); await p.click('#g-link'); }
  else await h.click('#signin');
  if (how === 'desktop') return;
  /* a sign-in screen drawn a second time as the page settles can swallow the
     first tap: tap once more if it is still there */
  try { await p.waitForSelector('#nav', { state: 'visible', timeout: 4000 }); }
  catch (e) { var again = how === 'customer' ? '#g-link' : '#signin'; if (await p.$(again)) await p.click(again); await h.wait('#nav'); }
}

(async function () {
  if (process.argv.indexOf('--list') >= 0) { SHOTS.forEach(function (s) { console.log(s.name + '  ' + s.what); }); return; }
  var picked = SHOTS;
  if (ONLY) {
    var names = ONLY.split(',').map(function (x) { return x.trim().replace(/\.png$/, ''); }).filter(Boolean), known = SHOTS.map(function (s) { return s.name; });
    var unknown = names.filter(function (n) { return known.indexOf(n) < 0; });
    if (unknown.length) { console.error('shots: no shot named ' + unknown.join(', ') + '. Known: ' + known.join(', ')); process.exit(2); }
    picked = SHOTS.filter(function (s) { return names.indexOf(s.name) >= 0; });
  }
  var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })();
  var chromium = require(PW).chromium, PINNED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  var CHROME = process.env.CHROME || (fs.existsSync(PINNED) ? PINNED : chromium.executablePath());

  var sb = sandboxFiles(), servers = {}, bases = {};
  console.log('shots: ' + ROOT + ' → ' + OUT + '\n  sandbox ' + sb.from + (/['"]\/api\/crm['"]/.test(sb.files['sandbox.js']) ? '' : '\n  the sandbox has no /api/crm: the account sections use the sample in crmSample()'));
  fs.mkdirSync(OUT, { recursive: true });
  /* the record of what passed; an --only run keeps every other entry */
  var manifest = Guard.readManifest(OUT), tree = ROOT === OWN_ROOT ? '.' : ROOT, commit = '';
  try { commit = cp.execSync('git -C ' + JSON.stringify(ROOT) + ' rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) {}
  var browser = await chromium.launch({ executablePath: CHROME }), done = [], failed = [];
  for (var i = 0; i < picked.length; i++) {
    var shot = picked[i], v = shot.view || PHONE, ctx = null;
    try {
      if (!servers[shot.who]) { servers[shot.who] = await serve(sb.files, shot.who); bases[shot.who] = 'http://127.0.0.1:' + servers[shot.who].address().port; }
      var base = bases[shot.who];
      ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.scale, locale: 'en-US', timezoneId: TZ, serviceWorkers: 'block' });
      await ctx.clock.setFixedTime(new Date(AT));
      await ctx.route('**/*', function (r) {
        var u = r.request().url();
        if (u.indexOf(base + '/') === 0) return r.continue();
        if (/^https:\/\/www\.gstatic\.com\//.test(u)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
        return r.abort();
      });
      await ctx.addInitScript(function (staff) {
        window.OMEGA_SANDBOX_STAFF = staff;
        document.addEventListener('DOMContentLoaded', function () { var s = document.createElement('style'); s.textContent = '.sb-strip,.sb-toast{display:none!important}'; document.head.appendChild(s); });
      }, 'you@' + WHO[shot.who].domain);
      if (shot.signIn === 'session') await ctx.addInitScript(function (email) { try { if (!localStorage.getItem('omega_sandbox_user_v1')) localStorage.setItem('omega_sandbox_user_v1', JSON.stringify({ email: email })); } catch (e) {} }, 'you@' + WHO[shot.who].domain);
      /* an app on an iPhone Home Screen (navigator.standalone) */
      if (shot.installed) await ctx.addInitScript(function () { try { Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get: function () { return true; } }); } catch (e) {} });
      var p = await ctx.newPage(), errs = [], h = helpers(p, shot.name);
      p.on('pageerror', function (e) { errs.push(e.message); });
      await p.goto(base + shot.page, { waitUntil: 'domcontentloaded' });
      if (shot.signIn) await signIn(p, h, shot.signIn);
      if (shot.steps) await shot.steps(p, h);
      await h.wait(shot.ready);
      await h.settle();
      var seen = await p.evaluate(function () {
        var bits = [document.title, document.body.innerText];
        Array.prototype.forEach.call(document.querySelectorAll('input,textarea,select'), function (e) { bits.push(e.placeholder || '', e.value || ''); });
        return bits.join('\n');
      });
      var leak = seen.match(LEAK), named = Discreet.hits(seen);
      if (leak) throw new Error('a tenant name is readable on the screen: "' + leak[0] + '" — add it to NEUTRAL');
      if (named.length) throw new Error('a name no file may carry is readable on the screen (' + named.map(function (x) { return x.what; }).join('; ') + ') — neutralise it in the fixtures');
      var file = path.join(OUT, shot.name + '.png');
      /* clip: [from, to] — only the band of the page from the top of one
         element to the bottom of another, across the panel they sit in (a
         desktop step, big enough to read on a printed page) */
      var clip = shot.clip ? await p.evaluate(function (sel) {
        var a = document.querySelector(sel[0]), b = document.querySelector(sel[1]); if (!a || !b) return null;
        var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), box = (a.closest('.panel,section') || a.parentNode).getBoundingClientRect();
        return { x: Math.max(0, box.left + scrollX), y: Math.max(0, ra.top + scrollY - 16), width: box.width, height: rb.bottom - ra.top + 32 };
      }, shot.clip) : null;
      if (shot.clip && !clip) throw new Error('nothing to clip to: ' + shot.clip.join(' … '));
      await p.screenshot(clip ? { path: file, animations: 'disabled', fullPage: true, clip: clip } : { path: file, animations: 'disabled' });
      manifest[shot.name + '.png'] = { sha256: Guard.sha256(file), takenAt: new Date().toISOString(), tree: tree, commit: commit };
      Guard.writeManifest(OUT, manifest);
      done.push(shot.name); console.log('  ok    ' + shot.name + (errs.length ? '  (page errors: ' + errs.slice(0, 2).join(' | ') + ')' : ''));
    } catch (e) {
      /* SHOTS_DEBUG=<dir>: what the page looked like when the shot failed */
      if (process.env.SHOTS_DEBUG && ctx) { try { var pg = ctx.pages()[0]; if (pg) await pg.screenshot({ path: path.join(process.env.SHOTS_DEBUG, 'failed-' + shot.name + '.png') }); } catch (x) {} }
      failed.push(shot.name + ': ' + String(e && e.message || e).split('\n')[0]); console.log('  FAIL  ' + failed[failed.length - 1]);
    } finally { if (ctx) await ctx.close(); }
  }
  await browser.close(); Object.keys(servers).forEach(function (k) { servers[k].close(); });
  console.log('\n' + done.length + ' of ' + picked.length + ' shots written to ' + OUT + (failed.length ? '\nfailed:\n  ' + failed.join('\n  ') : ''));
  if (failed.length) process.exit(1);
})().catch(function (e) { console.error(e); process.exit(1); });
