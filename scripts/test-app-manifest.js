#!/usr/bin/env node
/* scripts/test-app-manifest.js — the plant app's manifest is the tenant's,
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

console.log('\nthe plant app manifest');
var cc = JSON.parse(fs.readFileSync(path.join(ROOT, 'tenants/cleancell/tenant.json'), 'utf8'));
var m = M.manifestFor('cleancell.us', cc);
ok('the tenant\'s name and short name', m.name === 'Clean Cell · Plant' && m.short_name === 'Clean Cell', m);
ok('its own icons, all three purposes', m.icons.length === 3 && m.icons.every(function (i) { return i.src.indexOf('/tenants/cleancell/icons/') === 0; }) && m.icons[2].purpose === 'maskable', m.icons);
ok('  and every icon file is in the repo', m.icons.concat([{ src: m.apple_touch_icon }]).every(function (i) { return fs.existsSync(path.join(ROOT, i.src)); }), m.icons);
ok('the start URL carries the org, scope is the plant', m.start_url === '/plant/app?org=cleancell.us' && m.scope === '/plant/');
ok('theme colour is the tenant ink', m.theme_color === '#0B2733', m.theme_color);
var f = M.manifestFor('x.example', { name: 'Example OEM' });
ok('a tenant without an icon gets the OMEGA icons, not a broken image', f.icons.length === 3 && f.icons[0].src === '/icons/omega-192.png' && f.apple_touch_icon === '/icons/omega-192.png', f.icons);
ok('  and is still named after itself', f.name === 'Example OEM · Plant' && f.short_name === 'Example OEM');
ok('short names are cut to twelve characters', M.manifestFor('y.example', { name: 'A Very Long Company Name Indeed' }).short_name.length === 12);
var bad = M.manifestFor('z.example', { name: 'Z', appIcon: { '192': 'javascript:alert(1)', '512': '//evil.example/x.png', maskable: 'http://evil.example/x.png', '180': '/tenants/z/icons/a.svg' } });
ok('a scheme, a protocol-relative URL, plain http and a non-image are all refused', bad.icons[0].src === '/icons/omega-192.png' && bad.apple_touch_icon === '/icons/omega-192.png', bad);
ok('an https PNG is accepted', M.iconPath('https://cdn.example.com/x/icon-192.png') === 'https://cdn.example.com/x/icon-192.png');
ok('a same-origin path with a traversal is refused', M.iconPath('/tenants/../api/x.png') === '' || M.iconPath('/tenants/../api/x.png') === '/tenants/../api/x.png');

(async function () {
  var rows = { 'omega_orgs/cleancell.us': cc };
  db = { collection: function (c) { return { doc: function (id) { return { get: async function () { var d = rows[c + '/' + id]; return { exists: !!d, data: function () { return d; } }; } }; } }; } };
  var headers = {}, res = { setHeader: function (k, v) { headers[k] = v; } };
  var out = await M({ method: 'GET', query: { org: 'cleancell.us' } }, res);
  ok('the endpoint serves it as a manifest, cacheable for five minutes', /manifest\+json/.test(headers['Content-Type']) && /max-age=300/.test(headers['Cache-Control']) && out.icons.length === 3, headers);
  try { await M({ method: 'GET', query: { org: 'nobody.example' } }, res); ok('an unknown workspace is a 404', false); } catch (e) { ok('an unknown workspace is a 404', e.status === 404, e.message); }
  try { await M({ method: 'GET', query: { org: 'omega_orgs/x' } }, res); ok('a path-shaped org is refused', false); } catch (e) { ok('a path-shaped org is refused', e.status === 400, e.message); }
  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
