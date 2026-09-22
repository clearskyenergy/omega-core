#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   build-app-sandbox.js — the three phone apps as sandboxes, for a phone.

   Produces app-sandbox/ (committed, like portals/skyfund-sandbox/):
     plant.html, office.html, customer.html, bench.html   the REAL pages,
         with the Firebase SDK and the workspace runtime replaced by
         sandbox.js, their manifests and service worker pointed here, and
         the bench link pointed at the sandbox bench
     sandbox.js   scripts/_lib/logic-fixtures.js and every pure library it
         requires (materials, plant-board, plant-stats, plant-work,
         office-stage, logic-catalog, the manifest builder), bundled with a
         forty-line CommonJS loader, then scripts/_lib/app-sandbox-shim.js
     <app>.webmanifest, sw.js, README.md

   Every rewrite is an asserted string replacement: if a page changes shape
   the build fails loudly instead of shipping a sandbox that half works.
   scripts/tests/tappsandbox.js rebuilds to a temp folder and diffs it
   against the committed one, so the sandbox cannot go stale unnoticed.

     node scripts/build-app-sandbox.js            # writes app-sandbox/
     node scripts/build-app-sandbox.js /tmp/out   # elsewhere                */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var ADMIN = path.join(ROOT, 'api/_lib/admin.js');
var TENANT = JSON.parse(fs.readFileSync(path.join(ROOT, 'tenants/cleancell/tenant.json'), 'utf8'));

/* ── a small CommonJS bundle ─────────────────────────────────────────── */
function resolveFile(p) { if (fs.existsSync(p) && fs.statSync(p).isFile()) return p; if (fs.existsSync(p + '.js')) return p + '.js'; if (fs.existsSync(p + '.json')) return p + '.json'; throw new Error('cannot resolve ' + p); }
function bundle(entry) {
  var mods = {}, order = [];
  function id(abs) { return path.relative(ROOT, abs).split(path.sep).join('/'); }
  function visit(abs) {
    if (mods[abs] !== undefined) return;
    if (abs === ADMIN) { mods[abs] = null; order.push(abs); return; }
    var src = fs.readFileSync(abs, 'utf8');
    if (/require\((['"])[^.'"]/.test(src)) throw new Error(id(abs) + ' requires a node module; the sandbox cannot bundle it');
    mods[abs] = src.replace(/require\((['"])(\.[^'"]+)\1\)/g, function (m, q, rel) { var dep = resolveFile(path.resolve(path.dirname(abs), rel)); visit(dep); return "require('" + id(dep) + "')"; });
    order.push(abs);
  }
  visit(entry);
  var out = '(function () {\n  var defs = {}, cache = {};\n  function req(id) { if (cache[id]) return cache[id].exports; var m = { exports: {} }; cache[id] = m; defs[id](m, m.exports, req); return m.exports; }\n';
  out += "  defs['api/_lib/admin.js'] = function (module) { module.exports = { httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, handler: function (f) { return f; }, db: function () { throw new Error('no Firestore in the sandbox'); }, safeOrg: function (x) { return x; }, FieldValue: function () { return { serverTimestamp: function () { return null; } }; } }; };\n";
  order.forEach(function (abs) { if (mods[abs] === null) return; out += "  defs['" + id(abs) + "'] = function (module, exports, require) {\n" + mods[abs] + "\n  };\n"; });
  out += "  window.OmegaSandboxFixtures = req('" + id(entry) + "');\n  window.OMEGA_SANDBOX_TENANT = " + JSON.stringify({ name: TENANT.name, whiteLabel: TENANT.whiteLabel, appIcon: TENANT.appIcon }) + ";\n})();\n";
  return out;
}

/* ── the pages ───────────────────────────────────────────────────────── */
function must(s, old, neu, label) { if (s.indexOf(old) < 0) throw new Error('build-app-sandbox: ' + label + ' — expected to find: ' + old.slice(0, 80)); return s.split(old).join(neu); }
var GSTATIC = /<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>/g;
var PAGES = [
  { src: 'plant/app.html', out: 'plant.html', app: 'plant', title: 'Plant', icon: TENANT.appIcon['180'], manifest: '/plant/app.webmanifest',
    runtime: '<script src="/config.js"></script><script src="/omega-brand.js"></script><script src="/omega-tenant.js"></script>',
    mf: "var mf = document.querySelector('link[rel=\"manifest\"]'); if (mf) mf.href = '/api/app-manifest?org=' + encodeURIComponent(ORG);", sw: "navigator.serviceWorker.register('/plant/app-sw.js', { scope: '/plant/app' })" },
  { src: 'office/app.html', out: 'office.html', app: 'office', title: 'Office', icon: TENANT.appIcon.office['180'], manifest: '/office/app.webmanifest',
    runtime: '<script src="/config.js"></script><script src="/omega-brand.js"></script><script src="/omega-tenant.js"></script>',
    mf: "var mf = document.querySelector('link[rel=\"manifest\"]'); if (mf) mf.href = mfUrl;", sw: "navigator.serviceWorker.register('/office/app-sw.js', { scope: '/office/app' })" },
  { src: 'portals/customer/app.html', out: 'customer.html', app: 'customer', title: 'Your account', icon: TENANT.appIcon.customer['180'], manifest: '/portals/customer/app.webmanifest',
    runtime: '<script src="/config.js"></script>',
    mf: "var mf = document.querySelector('link[rel=\"manifest\"]'); if (mf) mf.href = mfUrl;", sw: "navigator.serviceWorker.register('/portals/customer/app-sw.js', { scope: '/portals/customer/app' })" },
  { src: 'plant/station.html', out: 'bench.html', app: 'bench', title: 'Station — scan in', bench: true }
];
var SANDBOX_SCRIPT = '<script src="/app-sandbox/sandbox.js"></script>';
function page(p) {
  var s = fs.readFileSync(path.join(ROOT, p.src), 'utf8');
  if (p.bench) {
    s = must(s, '<script src="/omega-logic-theme.js"></script>', SANDBOX_SCRIPT + '<script src="/omega-logic-theme.js"></script>', p.src + ' theme script');
    s = must(s, '<title>' + p.title + '</title>', '<title>' + p.title + ' · sandbox</title>', p.src + ' title');
    return s;
  }
  var before = s;
  s = s.replace(GSTATIC, ''); if (s === before) throw new Error('build-app-sandbox: ' + p.src + ' — no Firebase scripts to remove');
  s = must(s, p.runtime, SANDBOX_SCRIPT, p.src + ' runtime scripts');
  s = must(s, '<link rel="manifest" href="' + p.manifest + '">', '<link rel="manifest" href="/app-sandbox/' + p.app + '.webmanifest">', p.src + ' manifest');
  s = must(s, '<link rel="apple-touch-icon" href="/icons/omega-192.png">', '<link rel="apple-touch-icon" href="' + p.icon + '">', p.src + ' apple icon');
  s = must(s, '<title>' + p.title + '</title>', '<title>' + p.title + ' · sandbox</title>', p.src + ' title');
  s = must(s, p.mf, '/* sandbox: the manifest link is static */', p.src + ' manifest swap');
  s = must(s, p.sw, "navigator.serviceWorker.register('/app-sandbox/sw.js', { scope: '/app-sandbox/' })", p.src + ' service worker');
  if (s.indexOf('/plant/station.html') >= 0) s = s.split('/plant/station.html').join('/app-sandbox/bench');
  if (s.indexOf('/plant/station.html') >= 0) throw new Error('build-app-sandbox: ' + p.src + ' — a bench link survived the rewrite');
  return s;
}
function manifest(app) {
  require.cache[require.resolve(ADMIN)] = { id: ADMIN, filename: ADMIN, loaded: true, exports: { httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, handler: function (f) { return f; }, db: function () { throw new Error('no db'); }, safeOrg: function (x) { return x; } } };
  var m = require('../api/app-manifest').manifestFor('cleancell.us', TENANT, app);
  m.id = '/app-sandbox/' + app; m.start_url = '/app-sandbox/' + app; m.scope = '/app-sandbox/'; m.description = 'Sandbox — ' + m.description + ' Nothing is real.';
  return JSON.stringify(m, null, 2) + '\n';
}
var SW = "/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.\n   app-sandbox/sw.js — one worker for the three sandboxes. Network first,\n   same-origin only, never /api/ (the sandbox answers those on the page and\n   they never reach the network), so a rebuild is picked up on the next\n   open and the pages still open with no signal.  ES5. */\nvar VERSION = 'app-sandbox-v1';\nself.addEventListener('install', function () { self.skipWaiting(); });\nself.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });\nself.addEventListener('fetch', function (e) {\n  var req = e.request; if (req.method !== 'GET') return;\n  var url; try { url = new URL(req.url); } catch (err) { return; }\n  if (url.origin !== self.location.origin || url.pathname.indexOf('/api/') === 0) return;\n  e.respondWith(fetch(req).then(function (res) {\n    if (res && res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); })['catch'](function () {}); }\n    return res;\n  })['catch'](function () { return caches.match(req).then(function (hit) { return hit || (req.mode === 'navigate' ? caches.match('/app-sandbox/plant') : undefined); }); }));\n});\n";
var README = fs.readFileSync(path.join(__dirname, '_lib/app-sandbox-README.md'), 'utf8');

function build(outDir) {
  var files = {};
  files['sandbox.js'] = '/* Omega Logic phone sandboxes — generated by scripts/build-app-sandbox.js. Do not edit; edit scripts/_lib/logic-fixtures.js or scripts/_lib/app-sandbox-shim.js and rebuild. */\n' + bundle(path.join(ROOT, 'scripts/_lib/logic-fixtures.js')) + fs.readFileSync(path.join(__dirname, '_lib/app-sandbox-shim.js'), 'utf8');
  PAGES.forEach(function (p) { files[p.out] = page(p); if (!p.bench) files[p.app + '.webmanifest'] = manifest(p.app); });
  files['sw.js'] = SW; files['README.md'] = README;
  if (outDir) { if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true }); Object.keys(files).forEach(function (f) { fs.writeFileSync(path.join(outDir, f), files[f]); }); }
  return files;
}
module.exports = { build: build, PAGES: PAGES };
if (require.main === module) { var out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'app-sandbox'); var files = build(out); console.log('app-sandbox: ' + Object.keys(files).length + ' files written to ' + path.relative(ROOT, out) + '/ (sandbox.js ' + Math.round(files['sandbox.js'].length / 1024) + ' KB)'); }
