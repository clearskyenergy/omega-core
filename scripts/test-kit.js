/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   test-kit.js — the one list of where everything lives (api/_lib/kit.js). */
'use strict';
var assert = require('assert'), K = require('../api/_lib/kit'), n = 0;
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
t('an attached tenant hostname replaces the open host for org-scoped items only', function () {
  var k = K.forOrg('cleancell.us', { name: 'Clean Cell', host: 'cleancell.clearskyomega.com' });
  assert.equal(k.items.filter(function (i) { return i.key === 'office-app'; })[0].url, 'https://cleancell.clearskyomega.com/office/app?org=cleancell.us');
  assert.ok(/^https:\/\/silmarillion/.test(k.items.filter(function (i) { return i.key === 'office-app'; })[0].sandbox), 'sandboxes stay on the open host');
});
t('the message per audience names each item, how to install it, the sandbox and the guide to attach', function () {
  var k = K.forOrg('cleancell.us', { name: 'Clean Cell' }), m = K.message(k, 'customer');
  assert.ok(/^Here is your Clean Cell Omega Logic kit for you\./.test(m)); assert.ok(/Customer app: https/.test(m)); assert.ok(/Add to Home Screen/.test(m)); assert.ok(/app-sandbox\/customer/.test(m)); assert.ok(/Omega-Logic-Customer-App\.pdf/.test(m)); assert.ok(/Sign in: Email login link/.test(m));
  var o = K.message(k, 'office'); assert.ok(/Office app: https/.test(o) && /Fleet register: https/.test(o) && /Omega-Logic-Office-App\.pdf/.test(o));
  var pl = K.message(k, 'plant'); assert.ok(/Plant app: https/.test(pl) && /Bench scan station: https/.test(pl) && !/Customer app/.test(pl));
});
console.log('\n' + n + ' kit checks passed');
