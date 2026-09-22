/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var path = require('path');
var root = path.resolve(__dirname, '..');
var calls = [], response;
function XHR() {}
XHR.prototype.open = function (method, url) { assert.equal(method, 'POST'); assert.equal(url, '/api/listings'); };
XHR.prototype.setRequestHeader = function () {};
XHR.prototype.send = function (body) {
  calls.push(JSON.parse(body)); this.status = 200; this.readyState = 4;
  this.responseText = JSON.stringify(response); this.onreadystatechange();
};
var context = { XMLHttpRequest: XHR, console: console };
vm.runInNewContext(fs.readFileSync(path.join(root, 'omega-site-market.js'), 'utf8'), context);
var market = context.OmegaSiteMarket;
var row = { id: 'parcel-1', addr: '1 Main St', ownerOfRecord: 'Holding LLC', businessSrc: 'business registry', owner: { name: 'Factory', phone: '5551234' } };
market.forSite(row, { assessor: false }, function (err, mk) {
  assert.ifError(err); assert.equal(mk.owner.name, 'Holding LLC');
  assert.equal(mk.owner.phone, undefined); assert.equal(mk.occupant.name, 'Factory');
});
assert.equal(calls.length, 0, 'opening must not spend');
response = { ok: true, connected: true, found: true, cache: 'miss', provider: 'crexi', allowance: { used: 1, cap: 10, remaining: 9 }, listing: { owner: { name: 'Holding LLC', email: 'owner@example.com' }, broker: { name: 'Broker', phone: '5559876', email: 'broker@example.com' }, listed: { forSale: true, askPrice: 500000, url: 'https://www.crexi.com/properties/123' } } };
market.forSite(row, { force: true, spend: true, assessor: false, token: 'test' }, function (err, mk) {
  assert.ifError(err); assert.equal(mk.listing.askPrice, 500000); assert.equal(mk.broker.name, 'Broker'); assert.equal(mk.spent, true);
});
assert.equal(calls[0].op, 'detail'); assert.equal(calls[0].address, row.addr);
assert.equal(market.needsMetered(row), false); assert.equal(market.allowance().remaining, 9);
var html = market.html(row);
['Owner', 'Occupant', 'Broker / listing contact', 'Listing', 'mailto:', 'tel:', 'https://www.crexi.com/properties/123', 'listings:crexi'].forEach(function (text) { assert.ok(html.indexOf(text) >= 0, text); });
market.forSite(row, { spend: true }, function () {}); assert.equal(calls.length, 1, 'repeat open uses cache');
response = { ok: true, connected: false, reason: 'Not configured' };
market.forSite({ id: 'offline', addr: '2 Main St' }, { spend: true, assessor: false, token: 'test' }, function (err, mk) {
  assert.ifError(err); assert.equal(mk.spent, false); assert.equal(mk.sources[mk.sources.length - 1].status, 'refused');
});
response = { ok: true, connected: true, found: false, cache: 'hit', reason: 'No match' };
market.forSite({ id: 'empty', addr: '3 Main St' }, { spend: true, assessor: false, token: 'test' }, function (err, mk) {
  assert.ifError(err); assert.equal(mk.spent, false); assert.equal(mk.listing, null);
});
var unsafe = { id: 'unsafe', src: 'crexi', owner: { name: '<script>alert(1)</script>' }, listed: { url: 'javascript:alert(1)' } };
html = market.html(unsafe); assert.ok(html.indexOf('<script>') < 0); assert.ok(html.indexOf('href="javascript:') < 0);
var page = fs.readFileSync(path.join(root, 'clearsky-sitefinder.html'), 'utf8');
assert.ok(page.indexOf('<script src="omega-site-market.js"></script>') >= 0);
assert.ok(/lookupMarket\(r,\s*SET\.enrich\s*===\s*true\)/.test(page));
assert.ok(page.indexOf("closest('[data-market-id]')") >= 0);
assert.ok(market.html(row).indexOf('id="siteMarket"') < 0, 'drawer owns the navigation target ID');
var shownId = row.id, paints = [], pending, patches = [], saveCompletions = 0, saved = true;
var host = { querySelector: function () { return { getAttribute: function () { return shownId; } }; } };
Object.defineProperty(host, 'innerHTML', { set: function (value) { paints.push(value); } });
var integration = {
  ORG: 'example.com', _savedAuth: 'user-a',
  isSaved: function (id) { return saved && id === row.id; },
  savedWriteDone: function (err) { assert.ifError(err); saveCompletions++; },
  window: { OmegaSiteMarket: {
    html: function (r, busy) { return r.id + ':' + busy; },
    forSite: function (r, opts, cb) { pending = cb; }
  }, OmegaSiteSaves: { patch: function (id, packet, cb) {
    patches.push({ id: id, packet: packet }); cb(null);
  } } },
  document: { getElementById: function (id) { assert.equal(id, 'siteMarket'); return host; } }
};
vm.runInNewContext(page.slice(page.indexOf('  var marketBusy = {};'), page.indexOf('  function openDrawer(r)')), integration);
integration.lookupMarket(row, false);
assert.equal(paints[0], row.id + ':true', 'paint busy contents inside stable wrapper');
var persistedDetails = { id: row.id, owner: { name: 'Durable Owner', src: 'assessor:county' } };
pending(null, persistedDetails);
assert.strictEqual(row.market, persistedDetails);
assert.equal(patches.length, 1); assert.equal(patches[0].id, row.id);
assert.strictEqual(patches[0].packet.market, persistedDetails); assert.equal(saveCompletions, 1);
assert.equal(paints[1], row.id + ':false', 'paint completed contents inside stable wrapper');
integration.lookupMarket(row, false);
shownId = 'different-site';
var count = paints.length;
pending();
assert.equal(paints.length, count, 'late response must not overwrite a different drawer');
shownId = row.id;
saved = false;
integration.lookupMarket(row, true);
pending(null, persistedDetails);
assert.equal(patches.length, 1, 'unsaved sites must not be durably patched');
saved = true;
['ORG', '_savedAuth'].forEach(function (field) {
  integration.marketBusy = {};
  integration.lookupMarket(row, true);
  var oldCallback = pending, oldValue = integration[field];
  integration[field] = 'changed-' + field;
  integration.marketBusy = {};
  integration.lookupMarket(row, true);
  var currentCallback = pending, beforePaints = paints.length, beforePatches = patches.length;
  oldCallback(null, { owner: { name: 'Wrong account' } });
  assert.strictEqual(row.market, persistedDetails);
  assert.equal(paints.length, beforePaints, 'stale ' + field + ' callback must not paint');
  assert.equal(patches.length, beforePatches, 'stale ' + field + ' callback must not persist');
  assert.equal(integration.marketBusy[row.id], true, 'stale callback must not clear current loading state');
  currentCallback(null, persistedDetails);
  assert.equal(patches.length, beforePatches + 1);
  integration[field] = oldValue;
});
delete row.market;
market.reset();
assert.equal(market.cached(row.id), null);
assert.equal(market.allowance(), null);
assert.equal(market.needsMetered(row), true);

/* Hold transport responses so account B can start the SAME site before A
   finishes. A must neither publish its data nor consume B's callback queue. */
var requests = [], oldCallbacks = 0, newCallbacks = 0, progress = [];
XHR.prototype.send = function (body) { calls.push(JSON.parse(body)); requests.push(this); };
function answer(request, remaining, owner) {
  request.status = 200; request.readyState = 4;
  request.responseText = JSON.stringify({ ok: true, connected: true, found: true, cache: 'miss', provider: 'crexi',
    allowance: { remaining: remaining }, listing: { owner: { name: owner }, listed: { forSale: true } } });
  request.onreadystatechange();
}
var isolated = { id: 'same-site', addr: '4 Main St' };
market.forSite(isolated, { spend: true, assessor: false, token: 'account-a', onSource: function (key, state) { progress.push(state); } }, function () { oldCallbacks++; });
market.forSite(isolated, { spend: true, assessor: false, token: 'account-a' }, function () { oldCallbacks++; });
assert.equal(requests.length, 1, 'same-account requests coalesce');
market.reset();
market.forSite(isolated, { spend: true, assessor: false, token: 'account-b' }, function () { newCallbacks++; });
assert.equal(requests.length, 2, 'new account does not join old inflight work');
var progressCount = progress.length;
answer(requests[0], 99, 'Account A owner');
assert.equal(market.cached(isolated.id), null); assert.equal(market.allowance(), null);
assert.equal(oldCallbacks, 0); assert.equal(newCallbacks, 0); assert.equal(progress.length, progressCount);
answer(requests[1], 7, 'Account B owner');
assert.equal(newCallbacks, 1); assert.equal(market.cached(isolated.id).owner.name, 'Account B owner');
assert.equal(market.allowance().remaining, 7);

market.reset();
var tokenDone;
market.forSite(isolated, { spend: true, assessor: false, getToken: function (cb) { tokenDone = cb; } }, function () { oldCallbacks++; });
market.reset();
var requestCount = requests.length;
tokenDone(null, 'late-account-a-token');
assert.equal(requests.length, requestCount, 'late auth token must not start a request');
assert.equal(oldCallbacks, 0);

var parcelDone;
context.OmegaListings = { parcelAt: function (lat, lon, cb) { parcelDone = cb; } };
market.forSite({ id: 'parcel-pending', addr: '5 Main St', lat: 40, lon: -88 }, { spend: true, token: 'account-a' }, function () { oldCallbacks++; });
market.reset();
parcelDone(null, null);
assert.equal(requests.length, requestCount, 'late assessor result must not start paid lookup');
assert.equal(market.cached('parcel-pending'), null); assert.equal(oldCallbacks, 0);

/* A reset initiated by the first subscriber also cancels later subscribers. */
market.forSite(isolated, { spend: true, assessor: false, token: 'account-b' }, function () { market.reset(); });
market.forSite(isolated, { assessor: false }, function () { oldCallbacks++; });
answer(requests[requests.length - 1], 6, 'Discarded owner');
assert.equal(oldCallbacks, 0); assert.equal(market.cached(isolated.id), null); assert.equal(market.allowance(), null);
console.log('Site market contract passed (free open, API envelope, roles, cache, allowance, safe links, integration).');
