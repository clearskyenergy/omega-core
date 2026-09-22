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
     node scripts/build-app-sandbox.js /tmp/out   # elsewhere
     node scripts/build-app-sandbox.js --artifacts <dir> ['{"plant":"https://…"}']
                                                  # one relative-path folder
                                                  # per app, for private
                                                  # test links              */
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
var SW = "/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.\n   app-sandbox/sw.js — one worker for the three sandboxes. Network first,\n   same-origin only, never /api/ (the sandbox answers those on the page and\n   they never reach the network), so a rebuild is picked up on the next\n   open and the pages still open with no signal.  ES5. */\nvar VERSION = 'app-sandbox-v2';\nself.addEventListener('install', function () { self.skipWaiting(); });\nself.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });\nself.addEventListener('fetch', function (e) {\n  var req = e.request; if (req.method !== 'GET') return;\n  var url; try { url = new URL(req.url); } catch (err) { return; }\n  if (url.origin !== self.location.origin || url.pathname.indexOf('/api/') === 0) return;\n  e.respondWith(fetch(req).then(function (res) {\n    if (res && res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); })['catch'](function () {}); }\n    return res;\n  })['catch'](function () { return caches.match(req).then(function (hit) { return hit || (req.mode === 'navigate' ? caches.match('/app-sandbox/plant') : undefined); }); }));\n});\n";
var README = fs.readFileSync(path.join(__dirname, '_lib/app-sandbox-README.md'), 'utf8');

function build(outDir) {
  var files = {};
  files['sandbox.js'] = '/* Omega Logic phone sandboxes — generated by scripts/build-app-sandbox.js. Do not edit; edit scripts/_lib/logic-fixtures.js or scripts/_lib/app-sandbox-shim.js and rebuild. */\n' + bundle(path.join(ROOT, 'scripts/_lib/logic-fixtures.js')) + fs.readFileSync(path.join(__dirname, '_lib/app-sandbox-shim.js'), 'utf8');
  PAGES.forEach(function (p) { files[p.out] = page(p); if (!p.bench) files[p.app + '.webmanifest'] = manifest(p.app); });
  files['sw.js'] = SW; files['README.md'] = README;
  if (outDir) { if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true }); Object.keys(files).forEach(function (f) { fs.writeFileSync(path.join(outDir, f), files[f]); }); }
  return files;
}
/* ── the same four pages as private test links ─────────────────────────
   One folder per app, every reference relative, no service worker (the
   frame has none), the other apps' links written in (each artifact is its
   own origin, so the strip links out rather than routing). Nothing here is
   committed; scripts/publish-app-sandbox.js hands the folders to the
   Artifact tool. */
var SHARED = ['omega-logic-theme.css', 'omega-logic-theme.js', 'omega-po-bulk.js'];
var TITLES = { plant: 'Clean Cell Plant', office: 'Clean Cell Office', customer: 'Clean Cell Account', bench: 'Clean Cell Bench' };
function artifactPage(p, files, links) {
  var s = files[p.out], icon = p.bench ? null : p.icon;
  s = must(s, SANDBOX_SCRIPT, '<script>window.OMEGA_SANDBOX_APP=' + JSON.stringify(p.app) + ';window.OMEGA_SANDBOX_LINKS=' + JSON.stringify(links) + ';</script><script src="sandbox.js"></script>', p.out + ' sandbox script');
  SHARED.forEach(function (f) { s = s.split('"/' + f + '"').join('"' + f + '"'); });
  if (!p.bench) {
    s = must(s, '<link rel="manifest" href="/app-sandbox/' + p.app + '.webmanifest">', '<link rel="manifest" href="manifest.webmanifest">', p.out + ' manifest');
    s = must(s, '<link rel="apple-touch-icon" href="' + icon + '">', '<link rel="apple-touch-icon" href="icons/' + path.basename(icon) + '">', p.out + ' apple icon');
    s = must(s, "if ('serviceWorker' in navigator) { try { navigator.serviceWorker.register('/app-sandbox/sw.js', { scope: '/app-sandbox/' })['catch'](function () {}); } catch (e) {} }", '/* sandbox link: no service worker in this frame */', p.out + ' service worker');
    s = s.split("'/app-sandbox/bench'").join(JSON.stringify(links.bench || '#')).split('href="/app-sandbox/bench"').join('href="' + (links.bench || '#') + '"');
  }
  s = must(s, '<title>' + p.title + ' · sandbox</title>', '<title>' + TITLES[p.app] + '</title>', p.out + ' title');
  if (/\/app-sandbox\//.test(s)) throw new Error('build-app-sandbox: ' + p.out + ' — an /app-sandbox/ path survived the artifact rewrite');
  return s;
}
function buildArtifacts(outDir, links) {
  links = links || {}; var files = build(null), made = {};
  PAGES.forEach(function (p) {
    var dir = path.join(outDir, p.app); fs.mkdirSync(path.join(dir, 'icons'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), artifactPage(p, files, links));
    fs.writeFileSync(path.join(dir, 'sandbox.js'), files['sandbox.js']);
    SHARED.forEach(function (f) { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); });
    var iconApp = p.bench ? 'plant' : p.app, set = iconApp === 'plant' ? TENANT.appIcon : TENANT.appIcon[iconApp];
    ['180', '192', '512', 'maskable'].forEach(function (k) { fs.copyFileSync(path.join(ROOT, set[k]), path.join(dir, 'icons', path.basename(set[k]))); });
    if (!p.bench) { var m = JSON.parse(files[p.app + '.webmanifest']); m.id = p.app; m.start_url = '.'; m.scope = './'; m.icons.forEach(function (i) { i.src = 'icons/' + path.basename(i.src); }); m.apple_touch_icon = 'icons/' + path.basename(m.apple_touch_icon); fs.writeFileSync(path.join(dir, 'manifest.webmanifest'), JSON.stringify(m, null, 2) + '\n'); }
    made[p.app] = dir;
  });
  return made;
}
module.exports = { build: build, buildArtifacts: buildArtifacts, PAGES: PAGES, TITLES: TITLES };
if (require.main === module) {
  var ai = process.argv.indexOf('--artifacts');
  if (ai > 0) { var linksArg = process.argv[ai + 2] ? JSON.parse(process.argv[ai + 2]) : {}; var made = buildArtifacts(path.resolve(process.argv[ai + 1]), linksArg); console.log('artifact folders: ' + Object.keys(made).map(function (k) { return k + ' → ' + made[k]; }).join('\n                  ')); }
  else { var out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'app-sandbox'); var files = build(out); console.log('app-sandbox: ' + Object.keys(files).length + ' files written to ' + path.relative(ROOT, out) + '/ (sandbox.js ' + Math.round(files['sandbox.js'].length / 1024) + ' KB)'); }
}
