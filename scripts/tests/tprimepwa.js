#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   tprimepwa.js — Omega Prime installs as a phone app, and the wrapper
   stays a wrapper. The manifest, the worker's refusals, the one head
   block on omega-prime.html, and a mobile stylesheet that cannot reach
   a desktop window. No browser. */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '../..');
var fails = 0, checks = 0;
function ok(name, cond, detail) {
  checks++;
  if (!cond) { fails++; console.log('FAIL ' + name + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 400) : '')); }
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function pngSize(rel) {
  var b = fs.readFileSync(path.join(ROOT, rel));
  ok(rel + ' is a png', b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG', b.slice(0, 8));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

var manifest = JSON.parse(read('omega-prime.webmanifest'));
ok('name is Omega Prime', manifest.name === 'Omega Prime' && manifest.short_name === 'Omega Prime');
ok('standalone, themed, start at the app', manifest.display === 'standalone' && manifest.start_url === '/omega-prime' && manifest.scope === '/omega-prime' && manifest.id === '/omega-prime' && manifest.theme_color === '#0B2A3D' && manifest.background_color === '#F5F4F0');
var icons = {};
(manifest.icons || []).forEach(function (i) { icons[i.sizes + ' ' + (i.purpose || 'any')] = i.src; });
ok('192 and 512 any, plus a maskable 512', icons['192x192 any'] === '/icons/omega-prime-192.png' && icons['512x512 any'] === '/icons/omega-prime-512.png' && icons['512x512 maskable'] === '/icons/omega-prime-maskable-512.png', icons);
[['icons/omega-prime-192.png', 192], ['icons/omega-prime-512.png', 512], ['icons/omega-prime-180.png', 180], ['icons/omega-prime-maskable-512.png', 512]].forEach(function (j) {
  var s = pngSize(j[0]);
  ok(j[0] + ' is ' + j[1], s.w === j[1] && s.h === j[1], s);
});

var sw = read('omega-prime-sw.js');
var respond = sw.indexOf('e.respondWith');
ok('worker has a fetch handler', sw.indexOf("addEventListener('fetch'") > 0 && respond > 0);
['/api/', '/__/', "method !== 'GET'", 'authorization', 'origin !=='].forEach(function (needle) {
  var at = sw.indexOf(needle);
  ok('worker refuses ' + needle + ' before it answers', at > 0 && at < respond, at);
});
var filesBlock = sw.slice(sw.indexOf('var FILES'), sw.indexOf('];', sw.indexOf('var FILES')));
ok('shell list has no API path', filesBlock.indexOf('/api/') < 0 && filesBlock.indexOf('/__/') < 0, filesBlock.slice(0, 200));
ok('shell is network-first and drops redirects', sw.indexOf('keepable') > 0 && sw.indexOf('redirected') > 0 && sw.indexOf("cache: 'no-cache'") > 0);
ok('scope is the app, not the origin', read('omega-prime-pwa.js').indexOf("scope: '/omega-prime'") > 0 || read('omega-prime-pwa.js').indexOf("scope: SCOPE") > 0);
ok('register call names the scope', /register\('\/omega-prime-sw\.js', \{ scope: SCOPE \}\)/.test(read('omega-prime-pwa.js')));
ok('install prompt is not swallowed on the app page', /getElementById\('installBtn'\)/.test(read('omega-prime-pwa.js')) && /if \(!btn\) return;/.test(read('omega-prime-pwa.js')));

var html = read('omega-prime.html');
var head = html.slice(html.indexOf('</style>'), html.indexOf('</head>'));
['omega-prime-mobile.css', 'omega-prime.webmanifest', 'omega-prime-180.png', 'omega-prime-192.png', 'apple-mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style', 'apple-mobile-web-app-title', 'theme-color', 'omega-prime-pwa.js'].forEach(function (bit) {
  ok('head carries ' + bit, head.indexOf(bit) > 0);
});
ok('the head block is the wrapper after the page style', head.indexOf('Phone install') > 0 && head.indexOf('<body') < 0);
var bodyScripts = html.slice(html.indexOf('<body'));
ok('the page body does not gain a second copy of the worker', bodyScripts.indexOf('omega-prime-sw.js') < 0 && bodyScripts.indexOf('omega-prime-pwa.js') < 0);

var css = read('omega-prime-mobile.css').replace(/\/\*[\s\S]*?\*\//g, '').trim();
ok('mobile css is only the phone query', css.indexOf('@media (max-width: 760px)') === 0 && css.lastIndexOf('@media') === 0, css.slice(0, 80));
ok('phone rules touch the shell, not one step\'s copy', /#path button/.test(css) && /\.mapwrap/.test(css) && /\.drawer/.test(css) && /#guide/.test(css) && /\.edside/.test(css));

var install = read('omega-prime/install.html');
ok('install page is Add to Home Screen and an Install button', /Add to Home Screen/.test(install) && /Share/.test(install) && /id="installBtn"/.test(install) && /beforeinstallprompt/.test(read('omega-prime-pwa.js')));
ok('install page carries the same manifest and a QR', /omega-prime\.webmanifest/.test(install) && /qrcode\(0, 'M'\)/.test(install) && /\/omega-prime\/install/.test(install));
ok('a home-screen open of the install page enters the app', /display-mode: standalone/.test(install) && /location\.replace\('\/omega-prime'\)/.test(install));
ok('qr library is the vendored file', fs.existsSync(path.join(ROOT, 'vendor/qrcode-generator/2.0.4/qrcode.js')) && /qrcode-generator\/2\.0\.4\/qrcode\.js/.test(install));

var vercel = JSON.parse(read('vercel.json'));
ok('the worker is not cached stale', (vercel.headers || []).some(function (h) {
  return h.source === '/omega-prime-sw.js' && (h.headers || []).some(function (x) { return x.key === 'Cache-Control' && /max-age=0/.test(x.value); });
}));
ok('manifest content type is already a host rule', (vercel.headers || []).some(function (h) { return h.source === '/(.*)\\.webmanifest'; }));

if (fails) { console.log(fails + ' Omega Prime PWA check(s) FAILED'); process.exit(1); }
console.log('Omega Prime PWA: ' + checks + ' checks passed; manifest, icons, worker refusals, phone stylesheet, install page.');
