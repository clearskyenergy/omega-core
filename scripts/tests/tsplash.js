#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The OMEGA loading screen is on every page a person signs in to, first in
 * <head>, so no page paints its own content or a sign-in card before the
 * account is known, and every move between pages shows the mark
 * (Tommy, 2026-09-26). Static: the markup, the runtime's first-answer event,
 * the pages that end the splash themselves. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '../..'), count = 0;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function walk(dir, out) { fs.readdirSync(path.join(ROOT, dir)).forEach(function (n) { var rel = path.join(dir, n), abs = path.join(ROOT, rel); if (fs.statSync(abs).isDirectory()) { if (['node_modules', '.git', 'app-sandbox', 'docs', 'scripts', 'tenants', 'embed', 'vendor'].indexOf(n) < 0 && dir.split(path.sep).length < 3) walk(rel, out); } else if (/\.html$/.test(n)) out.push(rel); }); return out; }
var splash = read('omega-splash.js');
assert.match(splash, /© 2025–2026 ClearSky Energy Solutions LLC/); count++;
assert.ok(!/=>|\blet\s|\bconst\s|`/.test(splash), 'ES5'); count++;
['omega:auth', 'omega:entitlements', 'omega:splash-done', 'beforeunload', 'data-boot', 'data-hold', 'setTimeout(finish, 4000)'].forEach(function (k) { assert.ok(splash.indexOf(k) >= 0, k); count++; });
/* every page that signs people in loads the splash first in <head> */
var pages = walk('.', []).filter(function (p) { var s = read(p); return s.indexOf('omega-tenant.js') >= 0 || p === 'editor.html' || p === 'login.html'; });
assert.ok(pages.length >= 40, pages.length + ' signed-in pages'); count++;
var missing = [], notFirst = [];
pages.forEach(function (p) {
  var s = read(p), head = s.slice(0, s.search(/<body/i) < 0 ? s.length : s.search(/<body/i));
  var at = head.indexOf('omega-splash.js'); if (at < 0) { missing.push(p); return; }
  var firstScript = head.search(/<script[\s>]/i); if (firstScript < 0 || head.indexOf('omega-splash.js') > head.indexOf('>', firstScript)) notFirst.push(p);
});
assert.deepEqual(missing, [], 'pages without the splash: ' + missing.join(' ')); count++;
assert.deepEqual(notFirst, [], 'the splash is not the first script in: ' + notFirst.join(' ')); count++;
/* the dashboard keeps its own boot splash and only shows this one when leaving */
assert.match(read('index.html'), /<script src="\/omega-splash\.js\?v=1" data-boot="no"><\/script>/); count++;
/* the sign-in and signup pages decide themselves when the page is known */
['login.html', 'start.html'].forEach(function (p) { var s = read(p); assert.match(s, /omega-splash\.js\?v=1" data-hold="1"/, p + ' holds'); assert.ok(/OmegaSplash\.done\(\)/.test(s), p + ' ends it'); count += 2; });
/* the runtime names the first answer */
assert.match(read('omega-tenant.js'), /omega:auth/); count++;
console.log('loading screen: ' + pages.length + ' signed-in pages carry it first; ' + count + ' checks passed.');
