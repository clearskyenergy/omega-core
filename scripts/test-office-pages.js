#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-office-pages.js — the office pages say what is true
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The office's desktop and phone pages are single files with no build step,
   so these checks read them as shipped: the functions that decide what the
   Omega Logic app shows are lifted out of office/app.html and run against
   sample data; the rest is what the files say.

   · D1   the app's Menu shows "Price & accept" only to someone who may
          price (ClearSky, or an owner or administrator on what the
          workspace bills itself); D2 Team only to an owner or administrator
   · the app's status line starts clean on every tab (an old message never
     follows the person to Home); a dropped connection says so in words
   · OFF-05  Invite is "Share app link" while invitation email is off
   · OFF-06 / CUST-14  no real customer's name in any example, no
          hard-coded supplier, no "email automation" line for a customer
   · OFF-12 / LIVE-4 / DOC-m9  the footer and Settings say only what is
          true: no internal commercial wording, no processing fee where the
          workspace bills itself, no "Customers → Manage"
   · OFF-15  the dashboard names the company, then who it is billed to

     node scripts/test-office-pages.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
var count = 0;
function test(name, fn) { fn(); count++; console.log('  ok   ' + name); }
function plain(v) { return JSON.parse(JSON.stringify(v)); }

/* a named function out of a page's script, braces balanced (strings and
   regular expressions skipped the simple way: the office app writes none
   with a brace in them inside these functions) */
function lift(src, name) {
  var m = new RegExp('\\n\\s*function ' + name + '\\s*\\(').exec(src);
  assert.ok(m, 'office/app.html has a function ' + name);
  var start = m.index + 1, i = src.indexOf('{', start), depth = 0, q = null, c;
  for (; i < src.length; i++) {
    c = src.charAt(i);
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"') q = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('no end to ' + name);
}
var APP = read('office/app.html');

console.log('the Omega Logic app');
function menu(data, ws) {
  var ctx = { DATA: data, ORG: 'cleancell.us', WS: ws || null, encodeURIComponent: encodeURIComponent };
  vm.runInNewContext(lift(APP, 'access') + '\n' + lift(APP, 'mayPrice') + '\n' + lift(APP, 'has') + '\n' + lift(APP, 'menuPanels') + '\nvar OUT = menuPanels();', ctx);
  var rows = {}; plain(ctx.OUT).forEach(function (p) { p.rows.forEach(function (r) { rows[r[2]] = r; }); });
  return rows;
}
test('D1: "Price & accept" is in the Menu only for someone who may price, and says what they may do', function () {
  var cs = menu({ owner: true, access: { role: 'clearsky', prices: 'all', team: true }, billing: 'quickbooks', config: {} });
  assert.ok(cs['Price & accept']); assert.equal(cs['Price & accept'][3], 'Approve a price, accept, record shipment'); assert.equal(cs['Price & accept'][1], '/omega-logic?org=cleancell.us#orders');
  var admin = menu({ owner: false, access: { role: 'admin', prices: 'workspace', team: true }, billing: 'tenant', config: { accounting: 'tenant' } });
  assert.ok(admin['Price & accept']); assert.equal(admin['Price & accept'][3], 'Approve the price and accept the orders your company bills');
  assert.ok(!menu({ owner: false, access: { role: 'admin', prices: 'workspace', team: true }, billing: 'quickbooks', config: { accounting: 'quickbooks' } })['Price & accept'], 'an admin of a workspace ClearSky bills: nothing to price');
  assert.ok(!menu({ owner: false, access: { role: 'member', prices: 'none', team: false }, billing: 'tenant', config: { accounting: 'tenant' } })['Price & accept'], 'a member: no row');
  assert.ok(!menu({ owner: false, config: { accounting: 'tenant' } })['Price & accept'], 'a server from before D1: ClearSky only');
  assert.ok(menu({ owner: true, config: {} })['Price & accept']);
});
test('D2: Team is in the Menu for an owner or administrator (and ClearSky), not for a member', function () {
  assert.deepEqual(menu({ owner: false, access: { role: 'owner', prices: 'workspace', team: true }, billing: 'tenant', config: {} }).Team, ['href', '/logic-team.html?org=cleancell.us', 'Team', 'Add and turn off your office and plant staff']);
  assert.ok(!menu({ owner: false, access: { role: 'member', prices: 'none', team: false }, config: {} }).Team);
  assert.ok(!menu({ owner: false, access: { role: 'viewer', prices: 'none', team: false }, config: {} }).Team);
  assert.ok(menu({ owner: true, config: {} }).Team, 'ClearSky, on a server from before the flag');
});
test('the status line starts clean on every tab: an old message never follows the person to Home', function () {
  var said = [], drawn = [];
  var ctx = { DATA: {}, TAB: 'customers', PICK: null, CUST: null, SERIAL: null, document: { querySelectorAll: function () { return []; } }, Array: Array,
    status: function (t) { said.push(t); } };
  ['drawToday', 'drawOrder', 'drawOrders', 'drawPos', 'drawCustomer', 'drawCustomers', 'drawStock', 'drawMoney', 'drawSiteUnit', 'drawSites', 'drawMenu', 'front'].forEach(function (f) { ctx[f] = function () { drawn.push(f); }; });
  vm.runInNewContext('var SHOWN_TAB = null;\n' + lift(APP, 'draw') + '\nthis.draw = draw; this.setTab = function (t) { TAB = t; };', ctx);
  ctx.draw(); assert.deepEqual(said, [''], 'the first screen starts clean');
  said.length = 0; ctx.status('Saved. People who sign in from example.com now ask to join.'); ctx.draw();
  assert.deepEqual(said, ['Saved. People who sign in from example.com now ask to join.'], 'a redraw of the same tab keeps what it just said');
  said.length = 0; ctx.setTab('today'); ctx.draw(); assert.deepEqual(said, [''], 'Home starts clean');
  assert.match(APP, /b\.onclick = function \(\) \{ TAB = b\.dataset\.tab;[^}]*status\(''\);/, 'a tap on a tab clears it too');
});
test('DOC-m2: a dropped connection says so in words, and the offline banner does not claim to hide what is on screen', function () {
  var said = [];
  var ctx = { status: function (t) { said.push(t); }, OmegaLogicTheme: { plainError: function () { return 'No connection. Nothing was loaded or saved; try again when you are back online.'; } } };
  vm.runInNewContext(lift(APP, 'fail') + '\nfail(new TypeError("Failed to fetch"));', ctx);
  assert.equal(said[0], 'No connection. Nothing was loaded or saved; try again when you are back online.');
  assert.ok(!/showing nothing rather than something stale/.test(APP));
  assert.match(APP, /<div id="offline" class="off" hidden>Offline\. What is on screen was loaded before the connection dropped/);
  assert.ok(!/esc\(e\.message\)/.test(APP), 'no raw error message is printed as a screen');
});
test('OFF-05: Invite is "Share app link" while the workspace\'s invitation email is off (the server\'s inviteEmail)', function () {
  assert.match(APP, /\(c\.inviteEmail === false \? 'Share app link' : 'Invite'\)/);
  assert.match(APP, /if \(c\.inviteEmail === false\) \{ status\('Invitation email is off for this workspace; share the app link with ' \+ who \+ '\.'\); shareLink\(c\.appUrl/);
});
test('D1 in the app: the price step names whom it waits on; the money and stage tiles are the server\'s', function () {
  assert.match(APP, /function waitingLine\(o\)/); assert.ok(!/ClearSky approves the customer price\.'\) \+/.test(APP), 'no blanket "ClearSky approves" for a workspace that prices itself');
  assert.match(APP, /OmegaLogicTheme\.moneyTiles\(DATA\.receivables\)/); assert.ok(!/Deposits awaiting/.test(APP));
});

console.log('examples and wording');
/* The real buyer and its people, and another real customer of the sample
   tenant, never appear in what is served. The ONE matcher (scripts/_lib/
   discreet.js) looks for them without this file spelling any of them out. */
var Discreet = require('./_lib/discreet');
var MINE = ['office/app.html', 'office/app-sw.js', 'omega-logic-theme.js', 'omega-logic-theme.css', 'omega-logic.html', 'po-inbox.html', 'logic-settings.html', 'logic-logistics.html', 'logic-materials.html', 'logic-inventory.html'];
test('OFF-06 / CUST-14: no real customer name in any example line, placeholder or comment of the office pages', function () {
  MINE.forEach(function (f) { var h = Discreet.hits(read(f)); assert.ok(!h.length, f + ':' + (h[0] && h[0].line) + ' names ' + (h[0] && h[0].what)); });
});
test('R2: when a pasted PO number has two addresses, the office is not sent to a page that cannot enter it (customer-po in office mode only reviews an uploaded PO)', function () {
  var inbox = read('po-inbox.html');
  [['office/app.html', APP], ['po-inbox.html', inbox]].forEach(function (f) {
    var at = f[1].indexOf('id="bulk-several"'), note = f[1].slice(at, f[1].indexOf('</p>', at));
    assert.ok(at > 0, f[0] + ' keeps the note'); assert.ok(!/customer-po/.test(note), f[0] + ': no link to customer-po from the note');
    assert.match(note, /its own PO number/); assert.match(note, /One PO to several sites/);
  });
  assert.ok(!/bulk-several-link/.test(inbox));
  /* every office link into customer-po carries the PO it opens */
  (APP.match(/\/customer-po' \+ q \+ '&office=1[^"]*"/g) || []).forEach(function (l) { assert.match(l, /&intake=/, l); });
});
test('OFF-06: the PO sheet example is neutral sample lines, and the inbox names no supplier and says nothing false to a customer', function () {
  var inbox = read('po-inbox.html');
  assert.ok(!/CleanCell|Clean Cell/i.test(inbox), 'no hard-coded supplier, spelled any way');
  assert.ok(!/Email automation/i.test(inbox));
  assert.match(inbox, /<section id="email-intake" hidden>/); assert.match(inbox, /\$\('email-intake'\)\.hidden=!office;/, 'the email note is the office\'s only');
  assert.match(inbox, /placeholder="PO-1001, SKU-1, 2, Main Street site, 100 Main St, Springfield, IL, 62701/);
  assert.match(APP, /placeholder="PO-1001, ' \+ esc\(\(\(c\.products \|\| \[\]\)\[0\] \|\| \{\}\)\.sku \|\| 'SKU-1'\) \+ ', 2, Main Street site/);
  assert.ok(!/e\.g\. [a-z]+\.com/.test(APP.replace(/e\.g\. example\.com/g, '')), 'domain examples are example.com');
});
test('OFF-12 / LIVE-4 / DOC-m9: the footer and Settings say only what is true for how the workspace bills', function () {
  var desk = read('omega-logic.html'), settings = read('logic-settings.html');
  assert.ok(!/resale|No AI agent|Processing fees apply/i.test(desk.slice(desk.indexOf('<footer'), desk.indexOf('</footer>'))), 'footer: no internal commercial wording');
  assert.match(desk, /<footer id="foot">Omega Logic by ClearSky\.<\/footer>/);
  assert.match(desk, /Your company invoices its customers on its own paper; Omega Logic adds no processing fee to their orders\./);
  assert.ok(!/Customers → Manage/.test(settings)); assert.ok(!/Order processing fees are separate/.test(settings));
  assert.match(settings, /\(d\.config&&d\.config\.accounting\)==='tenant'\?'Your company invoices its customers on its own paper/);
  assert.ok(!/Tenant-billed|your paper'/.test(APP), 'no internal word for how an invoice is billed');
  assert.ok(!/due in ' \+ c\.terms\.dueDays \+ ' days'|due in ' \+ esc\(c\.terms\.dueDays\) \+ ' days'/.test(APP), '0 days reads "on receipt"');
});
test('OFF-13: nothing labelled "Quality & serial records" still opens the registration page', function () {
  ['omega-logic-theme.js', 'logic-settings.html'].forEach(function (f) { assert.ok(!/Quality & serial records/.test(read(f)), f); });
});
test('OFF-15: the dashboard names the company, then who it is billed to', function () {
  var desk = read('omega-logic.html');
  assert.ok(!/esc\(o\.customer\.name\)\+' · '\+esc\(o\.customer\.email\)/.test(desk));
  assert.match(desk, /esc\(OmegaLogicTheme\.company\(o\)\)\+\(o\.customer\.company&&\(o\.customer\.name\|\|o\.customer\.email\)\?' · billed to '/);
  assert.match(desk, /<td>'\+esc\(OmegaLogicTheme\.company\(r\.o\)\)\+'<\/td>/);
});

console.log('\n' + count + ' office page checks passed. No network.');
