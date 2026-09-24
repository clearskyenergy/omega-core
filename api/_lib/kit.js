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

/* audience: who the thing is for. install: how it goes on a phone. */
var ITEMS = [
  { key: 'plant-app', audience: 'plant', kind: 'app', name: 'Plant app', path: '/plant/app', org: true, sandbox: '/app-sandbox/plant', guide: '/guides/Omega-Logic-Plant-App.pdf', install: 'home-screen',
    what: 'Work orders, every unit and its step, the bench scanner, stock, quality holds. For the builders.', signin: 'Work Google account of the workspace' },
  { key: 'bench', audience: 'plant', kind: 'page', name: 'Bench scan station', path: '/plant/station.html', org: false, sandbox: '/app-sandbox/bench', guide: '/guides/Omega-Logic-Plant-App.pdf', install: 'tablet',
    what: 'A tablet at a bench, or a builder\'s phone paired as a roaming phone: scan a unit in, issue its parts, finish the step, send it on.', signin: 'Station credential from Work orders' },
  { key: 'office-app', audience: 'office', kind: 'app', name: 'Omega Logic app', path: '/office/app', org: true, sandbox: '/app-sandbox/office', guide: '/guides/Omega-Logic-Office-App.pdf', install: 'home-screen',
    what: 'The whole business in one app, laid out like QuickBooks: Home, Orders, Customers, Sites and a Menu that holds every other function — PO loads, stock, plant, fleet register, shipping, money, setup, guides.', signin: 'Work Google account of the workspace' },
  { key: 'office-desktop', audience: 'office', kind: 'desktop', name: 'Office (desktop)', path: '/omega-logic', org: true, sandbox: null, guide: null, install: null,
    what: 'The full system: pricing, acceptance, shipping, wires, the fleet register, sites and custody, the materials plan, products and bills.', signin: 'Work Google account of the workspace' },
  { key: 'register', audience: 'office', kind: 'desktop', name: 'Fleet register', path: '/logic-register.html', org: true, sandbox: null, guide: null, install: null,
    what: 'One spreadsheet row per serialized unit: seller, buyer, reseller, end customer, site, load, shipping and warranty dates, edited in place.', signin: 'Work Google account of the workspace' },
  { key: 'custody', audience: 'office', kind: 'desktop', name: 'Sites & custody', path: '/logic-custody.html', org: true, sandbox: null, guide: null, install: null,
    what: 'Where every shipped unit is, the passport, sites, the scan session, spreadsheet import, exceptions, coverage templates.', signin: 'Work Google account of the workspace' },
  /* The customer app is the TENANT's (their name, their icon), so its sample
     — built from the Clean Cell workspace — is only offered to that
     workspace's customers (sandboxOrg). */
  { key: 'customer-app', audience: 'customer', kind: 'app', name: 'Customer app', path: '/portals/customer/app', org: true, sandbox: '/app-sandbox/customer', sandboxOrg: 'cleancell.us', guide: '/guides/Omega-Logic-Customer-App.pdf', install: 'home-screen',
    what: 'Site plans in Editor Lite, the company account\'s orders with their milestone and warranty, purchase orders, and Sites & equipment: where each unit is going, received, assigned, commissioned. Everyone on the customer\'s account sees the same. For the buyer.', signin: 'Email login link or Google; someone at a company that already has an account asks to join it and the owner approves' },
  { key: 'customer-portal', audience: 'customer', kind: 'desktop', name: 'Customer portal (desktop)', path: '/portals/customer/', org: true, sandbox: null, guide: '/guides/Omega-Logic-Customer-App.pdf', install: null,
    what: 'The same account on a desktop: orders, documents, requests, Editor Lite at full width.', signin: 'Email login link or Google' },
  { key: 'customer-start', audience: 'customer', kind: 'page', name: 'Customer walkthrough', path: '/customer-start.html', org: true, sandbox: null, guide: null, install: null,
    what: 'The recommended website button: sizing, accounts and design, in order.', signin: 'None to start' }
];
var GUIDES = [
  { key: 'plant', name: 'Plant app guide', path: '/guides/Omega-Logic-Plant-App.pdf', audience: 'plant', covers: 'Install on a phone, the five tabs, the bench, how it meets the office and the customer.' },
  { key: 'office', name: 'Omega Logic app guide', path: '/guides/Omega-Logic-Office-App.pdf', audience: 'office', covers: 'Install on a phone, the hubs and the five tabs, customers and their people, what stays on the desktop.' },
  { key: 'customer', name: 'Customer app guide', path: '/guides/Omega-Logic-Customer-App.pdf', audience: 'customer', covers: 'Install on a phone, sign in, Design, Orders, POs, Sites & equipment, how it reaches the office.' },
  { key: 'all', name: 'All three apps (one document)', path: '/guides/Omega-Logic-Phone-Apps.pdf', audience: 'all', covers: 'The three apps and the bench together, the flow of one order, the sandboxes.' }
];

/* A tenant's own hostname, once it is attached and serving; else the open
   host. The one rule, so the office's customer links and the kit agree. */
function hostOf(d) { d = d || {}; return Array.isArray(d.domains) && d.domains[0] && d.domains[0] !== 'silmarillion.clearskyomega.com' && d.hostAttached === true ? d.domains[0] : null; }
function url(path, org, host) { var base = host ? 'https://' + String(host).replace(/^https?:\/\//, '').replace(/\/$/, '') : ORIGIN; return base + path + (org ? (path.indexOf('?') >= 0 ? '&' : '?') + 'org=' + encodeURIComponent(org) : ''); }
/* the kit for one workspace: every item with its live address, sandbox and guide */
function forOrg(org, opts) {
  opts = opts || {}; var host = opts.host || null;
  return { org: org, name: opts.name || org, brandName: opts.brandName || opts.name || org, host: host || ORIGIN.replace('https://', ''),
    items: ITEMS.map(function (it) { return { key: it.key, audience: it.audience, kind: it.kind, name: it.name, what: it.what, signin: it.signin, install: it.install, url: url(it.path, it.org ? org : null, host), sandbox: it.sandbox && (!it.sandboxOrg || it.sandboxOrg === org) ? ORIGIN + it.sandbox : null, guide: it.guide ? ORIGIN + it.guide : null }; }),
    guides: GUIDES.map(function (g) { return { key: g.key, name: g.name, audience: g.audience, covers: g.covers, url: ORIGIN + g.path }; }) };
}
/* a message Jarvis (or a person) can send as is: the links for one audience and the guide to attach */
function message(kit, audience) {
  var items = kit.items.filter(function (i) { return i.audience === audience; }), guide = kit.guides.filter(function (g) { return g.audience === audience; })[0];
  var who = { plant: 'the plant', office: 'the office', customer: 'you' }[audience] || audience;
  /* Omega Logic is ClearSky's name for the office and the plant; the
     customer's app is the supplier's own (its white-label name), so the
     customer's message never calls it Omega Logic. */
  var customer = audience === 'customer';
  var lines = [customer ? 'Here is your ' + (kit.brandName || kit.name) + ' account on your phone.' : 'Here is your ' + kit.name + ' Omega Logic kit for ' + who + '.', ''];
  items.forEach(function (i) { lines.push(i.name + ': ' + i.url); if (i.install === 'home-screen') lines.push('  Open it on your phone, then Share → Add to Home Screen (iPhone) or the browser menu → Install app (Android).'); lines.push('  ' + i.what); if (i.sandbox) lines.push('  Try it first with sample data: ' + i.sandbox); lines.push(''); });
  if (guide) lines.push(customer ? 'The attached guide (' + guide.url + ') shows how to install it, sign in and use it.' : 'The attached guide (' + guide.url + ') shows how to install it and use it, and how it links to the main system.');
  lines.push('', 'Sign in: ' + (items[0] ? items[0].signin : '') + '.');
  return lines.join('\n');
}
module.exports = { ORIGIN: ORIGIN, ITEMS: ITEMS, GUIDES: GUIDES, url: url, hostOf: hostOf, forOrg: forOrg, message: message };
