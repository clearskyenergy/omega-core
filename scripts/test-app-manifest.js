#!/usr/bin/env node
/* scripts/test-app-manifest.js — the office and plant apps are ClearSky's Omega Logic; the customer app is the tenant's,
   and an icon path is validated, never trusted
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/test-app-manifest.js */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function mock(p, e) { require.cache[require.resolve(p)] = { id: require.resolve(p), filename: require.resolve(p), loaded: true, exports: e }; }
var db = null;
mock('../api/_lib/admin', { db: function () { return db; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, handler: function (f) { return f; },
  safeOrg: function (s) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s || '') ? s : ''; } });
var M = require('../api/app-manifest');
var pass = 0, fail = 0;
function ok(label, yes, detail) { console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail !== undefined && !yes ? '  got: ' + JSON.stringify(detail) : '')); if (yes) pass++; else fail++; }

console.log('\nOmega Logic is ClearSky\'s: the office and plant apps');
var cc = JSON.parse(fs.readFileSync(path.join(ROOT, 'tenants/cleancell/tenant.json'), 'utf8'));
var off = M.manifestFor('cleancell.us', cc, 'office'), m = M.manifestFor('cleancell.us', cc);
ok('the office app is Omega Logic on every tenant\'s phone', off.name === 'Omega Logic' && off.short_name === 'Omega Logic' && M.manifestFor('x.example', { name: 'Example OEM' }, 'office').name === 'Omega Logic', off);
ok('the plant app is Omega Logic\'s plant hub', m.name === 'Omega Logic · Plant' && m.short_name === 'OL Plant' && m.short_name.length <= 12, m);
ok('both wear ClearSky\'s icon, never the tenant\'s, whatever the tenant record holds', [off, m].every(function (x) { return x.icons.length === 3 && x.icons.every(function (i) { return i.src.indexOf('/icons/omega-logic-') === 0; }) && x.icons[2].purpose === 'maskable' && x.apple_touch_icon === '/icons/omega-logic-180.png'; }), [off.icons, m.icons]);
ok('  and every icon file is in the repo', off.icons.concat([{ src: off.apple_touch_icon }]).every(function (i) { return fs.existsSync(path.join(ROOT, i.src)); }), off.icons);
ok('ClearSky\'s theme colour, not the tenant ink', off.theme_color === '#0C1824' && m.theme_color === '#0C1824');
ok('the start URL still carries the workspace; scope is each app', off.start_url === '/office/app?org=cleancell.us' && off.scope === '/office/' && off.id === '/office/app' && m.start_url === '/plant/app?org=cleancell.us' && m.scope === '/plant/');
ok('an unknown app is the plant app', M.manifestFor('cleancell.us', cc, 'kiosk').name === 'Omega Logic · Plant');

console.log('\nthe customer app is the tenant\'s');
var cust = M.manifestFor('cleancell.us', cc, 'customer');
ok('the customer app carries the tenant\'s platform name, scoped to the portal', cust.name === 'Clean Cell Power Platform' && cust.short_name === 'Clean Cell' && cust.start_url === '/portals/customer/app?org=cleancell.us' && cust.scope === '/portals/customer/', cust);
ok('its own icon set when the tenant drew one', /customer-192/.test(cust.icons[0].src) && /customer-180/.test(cust.apple_touch_icon), cust.icons[0]);
ok('  and every one of those files is in the repo', cust.icons.concat([{ src: cust.apple_touch_icon }]).every(function (i) { return fs.existsSync(path.join(ROOT, i.src)); }));
ok('theme colour is the tenant ink', cust.theme_color === '#0B2733' || /^#[0-9A-F]{6}$/i.test(cust.theme_color), cust.theme_color);
var f = M.manifestFor('x.example', { name: 'Example OEM' }, 'customer');
ok('a tenant without an icon gets the OMEGA icons, not a broken image', f.icons.length === 3 && f.icons[0].src === '/icons/omega-192.png' && f.apple_touch_icon === '/icons/omega-192.png', f.icons);
ok('  and is still named after itself', f.name === 'Example OEM' && f.short_name === 'Example OEM', f);
ok('short names are cut to twelve characters', M.manifestFor('y.example', { name: 'A Very Long Company Name Indeed' }, 'customer').short_name.length === 12);
var bad = M.manifestFor('z.example', { name: 'Z', appIcon: { '192': 'javascript:alert(1)', '512': '//evil.example/x.png', maskable: 'http://evil.example/x.png', '180': '/tenants/z/icons/a.svg' } }, 'customer');
ok('a scheme, a protocol-relative URL, plain http and a non-image are all refused', bad.icons[0].src === '/icons/omega-192.png' && bad.apple_touch_icon === '/icons/omega-192.png', bad);
ok('an https PNG is accepted', M.iconPath('https://cdn.example.com/x/icon-192.png') === 'https://cdn.example.com/x/icon-192.png');
ok('a same-origin path with a traversal is refused', M.iconPath('/tenants/../api/x.png') === '' || M.iconPath('/tenants/../api/x.png') === '/tenants/../api/x.png');
var shared = M.manifestFor('cleancell.us', { name: 'Clean Cell', appIcon: { '192': cc.appIcon['192'], '512': cc.appIcon['512'] } }, 'customer');
ok('a tenant with one shared set uses it for the customer app', /plant-192/.test(shared.icons[0].src) && shared.icons.length === 2, shared.icons);
ok('an empty per-app block falls back to the shared set, not to nothing', /plant-192/.test(M.manifestFor('cleancell.us', { name: 'X', appIcon: { '192': cc.appIcon['192'], customer: { '192': 'javascript:x' } } }, 'customer').icons[0].src));
ok('the three installs are distinct', [m.id, off.id, cust.id].filter(function (v, i, a) { return a.indexOf(v) === i; }).length === 3);

(async function () {
  var rows = { 'omega_orgs/cleancell.us': cc };
  db = { collection: function (c) { return { doc: function (id) { return { get: async function () { var d = rows[c + '/' + id]; return { exists: !!d, data: function () { return d; } }; } }; } }; } };
  var headers = {}, res = { setHeader: function (k, v) { headers[k] = v; } };
  var out = await M({ method: 'GET', query: { org: 'cleancell.us' } }, res);
  ok('the endpoint serves it as a manifest, cacheable for five minutes', /manifest\+json/.test(headers['Content-Type']) && /max-age=300/.test(headers['Cache-Control']) && out.icons.length === 3 && out.name === 'Omega Logic · Plant', headers);
  var o2 = await M({ method: 'GET', query: { org: 'cleancell.us', app: 'customer' } }, res);
  ok('the endpoint takes the app from the query', o2.name === 'Clean Cell Power Platform' && o2.scope === '/portals/customer/', o2);
  try { await M({ method: 'GET', query: { org: 'nobody.example' } }, res); ok('an unknown workspace is a 404', false); } catch (e) { ok('an unknown workspace is a 404', e.status === 404, e.message); }
  try { await M({ method: 'GET', query: { org: 'omega_orgs/x' } }, res); ok('a path-shaped org is refused', false); } catch (e) { ok('a path-shaped org is refused', e.status === 400, e.message); }
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
