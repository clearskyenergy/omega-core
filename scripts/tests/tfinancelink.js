/* The workspace → finance portal link: ONE address, written by
   omega-workspace-today.js dealHref() and read by portals/finance/index.html
   readLink(). Cut out of the real page source and run against the producer,
   so the two cannot drift (Tommy, 2026-09-29: Helios clicks a financing
   opportunity on the home "and it takes them into the opportunities and deal
   room").
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/tests/tfinancelink.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var T = require('../../omega-workspace-today.js');
var pass = 0, fail = 0;
function ok(m, c, got) { if (c) { pass++; return; } fail++; console.log('  FAIL ' + m + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }

var src = fs.readFileSync(path.join(__dirname, '..', '..', 'portals', 'finance', 'index.html'), 'utf8');
var from = src.indexOf('let LINK = null;'), to = src.indexOf('LINK = readLink();', from);
ok('the portal carries the link reader', from > 0 && to > from);
var cut = src.slice(from, to);

function boot(hash, stored, role) {
  var store = {}, replaced = [], toasts = [], opened = [];
  if (stored) store['omega:finance-link'] = stored;
  var sb = {
    URLSearchParams: URLSearchParams, JSON: JSON,
    location: { hash: hash || '', pathname: '/finance', search: '' },
    history: { replaceState: function (a, b, u) { replaced.push(u); } },
    sessionStorage: { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
    S: { role: role || 'partner', tab: role === 'dev' ? 'overview' : 'room' },
    TABS: { partner: [['room'], ['market'], ['watchlist']], dev: [['overview'], ['timelines'], ['deals']] },
    DEALS: [],
    allDeals: function () { return sb.DEALS; },
    openDeal: function (id) { opened.push(id); },
    toast: function (m, bad) { toasts.push([m, !!bad]); }
  };
  vm.createContext(sb);
  vm.runInContext(cut + '\nLINK = readLink();', sb);
  return { sb: sb, store: store, replaced: replaced, toasts: toasts, opened: opened };
}
/* LINK is a script-level let, so it is read through the context, never as a property */
function L(x) { return vm.runInContext('LINK', x.sb); }
function hashOf(href) { return href.slice(href.indexOf('#')); }

/* a deal in the room */
var h = T.dealHref('fin-joliet', 'room'), b = boot(hashOf(h));
ok('the producer writes /finance#deal=<id>&tab=room', h === '/finance#deal=fin-joliet&tab=room', h);
ok('the reader takes the deal and the tab', L(b) && L(b).deal === 'fin-joliet' && L(b).tab === 'room', L(b));
ok('and clears the address bar, as #new? does', b.replaced.length === 1 && b.replaced[0] === '/finance', b.replaced);
ok('and keeps it in this tab across a sign-in', JSON.parse(b.store['omega:finance-link']).deal === 'fin-joliet');
vm.runInContext('S.tab = "watchlist"; linkTab();', b.sb);
ok('the tab applies when the role has it', b.sb.S.tab === 'room', b.sb.S.tab);
vm.runInContext('openLinkedDeal(false);', b.sb);
ok('before the deal is read nothing opens and the link waits', b.opened.length === 0 && L(b) && b.toasts.length === 0);
b.sb.DEALS.push({ id: 'fin-joliet' });
vm.runInContext('openLinkedDeal(false);', b.sb);
ok('once a listener returns it the deal opens in the drawer, once, and the link is spent', b.opened.join() === 'fin-joliet' && L(b) === null && !('omega:finance-link' in b.store), b.opened);
vm.runInContext('openLinkedDeal(true);', b.sb);
ok('a spent link opens nothing again', b.opened.length === 1);

/* a deal the account cannot read */
var gone = boot('#deal=fin-rival&tab=market');
vm.runInContext('openLinkedDeal(true);', gone.sb);
ok('when every listener has answered without it, it says so plainly and is spent', gone.opened.length === 0 && gone.toasts.length === 1 && gone.toasts[0][1] === true && /not open to your account/.test(gone.toasts[0][0]) && L(gone) === null, gone.toasts);

/* a tab alone */
['room', 'market'].forEach(function (tab) {
  var t = boot(hashOf(T.dealHref(null, tab)));
  vm.runInContext('S.tab = "watchlist"; linkTab(); openLinkedDeal(true);', t.sb);
  ok('#' + tab + ' opens that tab and toasts nothing', t.sb.S.tab === tab && t.toasts.length === 0 && L(t) === null, { tab: t.sb.S.tab, toasts: t.toasts });
});
var dev = boot('#room', null, 'dev');
vm.runInContext('linkTab();', dev.sb);
ok('a tab the role does not have is ignored (a sponsor has no deal room tab)', dev.sb.S.tab === 'overview', dev.sb.S.tab);
var sponsor = boot(hashOf(T.dealHref('fin-maple')), null, 'dev');
ok('a sponsor\'s own deal link carries no tab and opens the deal', L(sponsor).deal === 'fin-maple' && L(sponsor).tab === null);

/* what is not a link */
var pre = boot('#new?name=Riverside&mw=2');
ok('the Battery Sizer prefill (#new?) is not taken for a link, nor cleared by it', L(pre) === null && pre.replaced.length === 0);
var none = boot('');
ok('no hash and nothing stored is no link', L(none) === null);
var carried = boot('', JSON.stringify({ deal: 'fin-aurora', tab: 'room' }));
ok('a link stored before a sign-in redirect is picked back up', L(carried) && L(carried).deal === 'fin-aurora');
var junk = boot('', '{not json');
ok('a broken stored value is no link, never an error', L(junk) === null);
ok('an id with a space round-trips', L(boot(hashOf(T.dealHref('a b')))).deal === 'a b');

console.log('tfinancelink: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
