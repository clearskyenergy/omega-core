/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   kit.js — WHERE EVERYTHING LIVES. The one list of the apps, pages,
   sandboxes and guides that make up a tenant's Omega Logic ecosystem, with
   the address of each for a given workspace. Read by the ClearSky-only
   Apps & guides page (logic-kit.html), by api/logic-kit.js, and by Jarvis
   when it sends a customer their links and the PDF that explains them.

   Pure: no Firestore, no network. A tenant's own hostname (when one is
   attached) replaces the open host; until then everything is reached on
   silmarillion.clearskyomega.com with ?org=. */
'use strict';
var ORIGIN = 'https://silmarillion.clearskyomega.com';

/* audience: who the thing is for. install: how it goes on a phone.
   send: false keeps an item on the Apps & guides page but out of every
   message (a link for the supplier to use, not to forward). An item's what
   and signin are said TO its audience: the customer's are read by the
   supplier's customer, word for word, in the message below. */
var ITEMS = [
  { key: 'plant-app', audience: 'plant', kind: 'app', name: 'Plant app', path: '/plant/app', org: true, sandbox: '/app-sandbox/plant', guide: '/guides/Omega-Logic-Plant-App.pdf', install: 'home-screen',
    what: 'Work orders, every unit and its step, the bench scanner, stock, quality holds. For the builders.', signin: 'Work Google account, or work email and password, of the workspace' },
  { key: 'bench', audience: 'plant', kind: 'page', name: 'Bench scan station', path: '/plant/station.html', org: false, sandbox: '/app-sandbox/bench', guide: '/guides/Omega-Logic-Plant-App.pdf', install: 'tablet',
    what: 'A tablet at a bench, or a builder\'s phone paired as a roaming phone: scan a unit in, issue its parts, finish the step, send it on.', signin: 'Station credential from Work orders' },
  { key: 'office-app', audience: 'office', kind: 'app', name: 'Omega Logic app', path: '/office/app', org: true, sandbox: '/app-sandbox/office', guide: '/guides/Omega-Logic-Office-App.pdf', install: 'home-screen',
    what: 'The whole business in one app, laid out like QuickBooks: Home, Orders, Customers, Sites and a Menu that holds every other function — PO loads, stock, plant, fleet register, shipping, money, setup, guides.', signin: 'Work Google account, or work email and password, of the workspace' },
  { key: 'office-desktop', audience: 'office', kind: 'desktop', name: 'Office (desktop)', path: '/omega-logic', org: true, sandbox: null, guide: '/guides/Omega-Logic-Office-App.pdf', install: null,
    /* D1 (2026-09-24): a workspace's owner or admin prices and accepts the
       orders it invoices itself; ClearSky prices what is billed through
       ClearSky's QuickBooks. The line says so rather than promising
       everyone a button. */
    what: 'The full system: orders, with prices and acceptance (your owner or admin on the orders you invoice yourselves; ClearSky on orders billed through ClearSky), shipping, payments, the fleet register, sites and custody, the materials plan, products and bills, and Team (your owner or admin adds and disables office and plant staff).', signin: 'Work Google account, or work email and password, of the workspace' },
  { key: 'register', audience: 'office', kind: 'desktop', name: 'Fleet register', path: '/logic-register.html', org: true, sandbox: null, guide: null, install: null,
    what: 'One spreadsheet row per serialized unit: seller, buyer, reseller, end customer, site, load, shipping and warranty dates, edited in place.', signin: 'Work Google account of the workspace' },
  { key: 'custody', audience: 'office', kind: 'desktop', name: 'Sites & custody', path: '/logic-custody.html', org: true, sandbox: null, guide: null, install: null,
    what: 'Where every shipped unit is, the passport, sites, the scan session, spreadsheet import, exceptions, coverage templates.', signin: 'Work Google account of the workspace' },
  /* The customer app is the TENANT's (their name, their icon), so its sample
     — built from the Clean Cell workspace — is only offered to that
     workspace's customers (sandboxOrg). */
  { key: 'customer-app', audience: 'customer', kind: 'app', name: 'Customer app', path: '/portals/customer/app', org: true, sandbox: '/app-sandbox/customer', sandboxOrg: 'cleancell.us', guide: '/guides/Omega-Logic-Customer-App.pdf', install: 'home-screen',
    what: 'Your company\'s orders with their milestones and warranty, your purchase orders, and Fleet: where each unit is going, when it was received, the site it is assigned to, when it was commissioned. Site plans in Editor Lite. Everyone on your company\'s account sees the same.', signin: 'Email login link or Google, with your work email, or that email and a password. In the app on an iPhone Home Screen use Google or the password (an emailed link opens in Safari instead). If your company already has an account, you ask to join it and its owner approves you' },
  { key: 'customer-portal', audience: 'customer', kind: 'desktop', name: 'Customer portal (desktop)', path: '/portals/customer/', org: true, sandbox: null, guide: '/guides/Omega-Logic-Customer-App.pdf', install: null,
    what: 'The same account on a computer: your orders, documents and requests, and Editor Lite at full width.', signin: 'Email login link or Google' },
  /* The page the supplier's own website button opens. For the supplier to
     put on its site, never forwarded to a customer (DOC-M7): send: false. */
  { key: 'customer-start', audience: 'customer', kind: 'page', name: 'Customer walkthrough', path: '/customer-start.html', org: true, sandbox: null, guide: null, install: null, send: false,
    what: 'For the supplier\'s website, not for a customer: the page its website button opens. Sizing, accounts and design, in order.', signin: 'None to start' }
];
var GUIDES = [
  { key: 'plant', name: 'Plant app guide', path: '/guides/Omega-Logic-Plant-App.pdf', audience: 'plant', covers: 'Install on a phone and sign in, the five tabs, the bench (scan, type or use the camera), a test result by hand, registering serials, how it meets the office and the customer.' },
  /* THE office guide, the Omega Logic app guide. scripts/guides/build.js
     writes it as Omega-Logic-Office-App.pdf (the name the apps' Help menus
     and every link already sent open) and also as Omega-Logic-App.pdf. The
     kit links the first until a build with the new guide's screenshots has
     written the second: a link the kit sends must never 404
     (scripts/test-kit.js). The key stays 'office' (the audience), as
     build.js keys its files and as /api/logic-kit hands it to Jarvis. */
  { key: 'office', name: 'Omega Logic app guide', path: '/guides/Omega-Logic-Office-App.pdf', audience: 'office', covers: 'Get the app on a phone (iPhone, Android) or a computer, sign in, the hub, customers, orders, sites, scanning with the camera, a customer\'s list of sites, Accounting, price & accept, Team, and your customers\' own app.' },
  { key: 'customer', name: 'Customer app guide', path: '/guides/Omega-Logic-Customer-App.pdf', audience: 'customer', covers: 'Install on a phone and sign in, Home and the five tabs (Home, Orders, POs, Fleet, Account), POs from a spreadsheet, your sites from a list, and how it reaches the supplier.' },
  { key: 'all', name: 'All three apps (one document)', path: '/guides/Omega-Logic-Phone-Apps.pdf', audience: 'all', covers: 'The three guides back to back: the Omega Logic app, the Plant app and the bench, and the customer app.' }
];

/* A tenant's own hostname, once it is attached and serving; else the open
   host. The one rule, so the office's customer links and the kit agree. */
function hostOf(d) { d = d || {}; return Array.isArray(d.domains) && d.domains[0] && d.domains[0] !== 'silmarillion.clearskyomega.com' && d.hostAttached === true ? d.domains[0] : null; }
function url(path, org, host) { var base = host ? 'https://' + String(host).replace(/^https?:\/\//, '').replace(/\/$/, '') : ORIGIN; return base + path + (org ? (path.indexOf('?') >= 0 ? '&' : '?') + 'org=' + encodeURIComponent(org) : ''); }
/* the kit for one workspace: every item with its live address, sandbox and guide */
function forOrg(org, opts) {
  opts = opts || {}; var host = opts.host || null;
  return { org: org, name: opts.name || org, brandName: opts.brandName || opts.name || org, host: host || ORIGIN.replace('https://', ''),
    items: ITEMS.map(function (it) { return { key: it.key, audience: it.audience, kind: it.kind, name: it.name, what: it.what, signin: it.signin, install: it.install, send: it.send !== false, url: url(it.path, it.org ? org : null, host), sandbox: it.sandbox && (!it.sandboxOrg || it.sandboxOrg === org) ? ORIGIN + it.sandbox : null, guide: it.guide ? ORIGIN + it.guide : null }; }),
    guides: GUIDES.map(function (g) { return { key: g.key, name: g.name, audience: g.audience, covers: g.covers, url: ORIGIN + g.path }; }) };
}
/* How an app goes on a device, said so it holds across browser versions.
   Safari on iOS 26 opens in its compact layout, where there is no Share
   button on screen: Share is inside the ••• menu at the end of the address
   bar, so the step names ••• first. An iPhone set to another layout (or on
   an older iOS) shows Share in the toolbar, and the bracket covers it.
   Chrome for Android's item reads "Install app", "Install and create
   shortcut" or, on older phones, "Add to Home screen". The steps match the
   Omega Logic app guide, pages 3-5. The office also works the app from a
   computer, so its line says how to install it there. */
var IPHONE = 'tap ••• at the end of the address bar → Share → Add to Home Screen → Add (if you see a Share button, tap it directly)';
var INSTALL = {
  phone: '  Open it on your phone. iPhone: in Safari ' + IPHONE + '. Android: in Chrome tap ⋮ → Install (it may read Install app, Install and create shortcut or Add to Home screen) → Install.',
  office: '  On a phone: iPhone, open it in Safari and ' + IPHONE + '. Android, open it in Chrome and tap ⋮ → Install and create shortcut (older Chrome: Install app or Add to Home screen) → Install. On a computer: open it in Chrome or Edge and click Install in the address bar, or in Safari on a Mac choose File → Add to Dock.'
};
/* a message Jarvis (or a person) can send as is: the links for one audience and the guide to attach */
function message(kit, audience) {
  var items = kit.items.filter(function (i) { return i.audience === audience && i.send !== false; }), guide = kit.guides.filter(function (g) { return g.audience === audience; })[0];
  var who = { plant: 'the plant', office: 'the office', customer: 'you' }[audience] || audience;
  /* Omega Logic is ClearSky's name for the office and the plant; the
     customer's app is the supplier's own (its white-label name), so the
     customer's message never calls it Omega Logic. */
  var customer = audience === 'customer';
  var lines = [customer ? 'Here is your ' + (kit.brandName || kit.name) + ' account on your phone.' : 'Here is your ' + kit.name + ' Omega Logic kit for ' + who + '.', ''];
  items.forEach(function (i) { lines.push(i.name + ': ' + i.url); if (i.install === 'home-screen') lines.push(INSTALL[audience] || INSTALL.phone); lines.push('  ' + i.what); if (i.sandbox) lines.push('  Try it first with sample data: ' + i.sandbox); lines.push(''); });
  if (guide) lines.push(customer ? 'The attached guide (' + guide.url + ') shows how to install it, sign in and use it.' : audience === 'office' ? 'The attached guide (' + guide.url + ') shows how to get it on a phone or a computer, sign in and use it, and how it links to the main system.' : 'The attached guide (' + guide.url + ') shows how to install it and use it, and how it links to the main system.');
  lines.push('', 'Sign in: ' + (items[0] ? items[0].signin : '') + '.');
  return lines.join('\n');
}
module.exports = { ORIGIN: ORIGIN, ITEMS: ITEMS, GUIDES: GUIDES, INSTALL: INSTALL, url: url, hostOf: hostOf, forOrg: forOrg, message: message };
