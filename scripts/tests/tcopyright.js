#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Every shipped file carries the LLC's notice (CLAUDE.md § IP protection),
 * and the owner a notice names is the LLC, literally. A customer's engineer
 * proposed building the editor themselves (2026-10-12); the editor's notices
 * named an individual, and its console banner printed brandName() — the
 * tenant's white label — as the copyright holder of our code. Static. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '../..'), count = 0;
var NOTICE = 'ClearSky Energy Solutions LLC. Proprietary and Confidential';
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function ls(dir, re) { var abs = path.join(ROOT, dir); if (!fs.existsSync(abs)) return []; return fs.readdirSync(abs).filter(function (n) { return re.test(n) && fs.statSync(path.join(abs, n)).isFile(); }).map(function (n) { return path.join(dir, n); }); }
var files = [].concat(
  ls('.', /\.html$/), ls('.', /^omega-.*\.js$/), ls('api', /\.js$/), ls('api/_lib', /\.js$/),
  ls('admin', /\.(js|html)$/), ls('console', /\.(js|html)$/), ls('embed', /\.(js|html)$/),
  ls('portals/finance', /\.(js|html)$/), ls('portals/customer', /\.(js|html)$/));
assert.ok(files.length > 150, files.length + ' shipped files'); count++;
var missing = files.filter(function (f) { return read(f).indexOf(NOTICE) < 0; });
assert.deepEqual(missing, [], 'shipped files without the LLC notice: ' + missing.join(' ')); count++;

/* the editor: the notice is in <head>, the licence link is there, no notice
   names another owner, and the console banner is the LLC by literal */
var ed = read('editor.html'), head = ed.slice(0, ed.search(/<body/i));
assert.match(head, /<meta name="copyright" content="© 2025–2026 ClearSky Energy Solutions LLC\. Proprietary and Confidential\./); count++;
assert.match(head, /<link rel="license" href="\/terms\.html">/); count++;
var other = ed.match(/(?:\(c\)|©|Copyright)\s*20\d\d[^\n]{0,40}Tommy Gilmer/g) || [];
assert.deepEqual(other, [], 'a notice naming an individual as owner: ' + other.join(' | ')); count++;
assert.match(ed, /data-owner="ClearSky Energy Solutions LLC"/); count++;
var banner = ed.slice(ed.indexOf('// Ownership declaration'), ed.indexOf('window._tgOwnership'));
assert.ok(banner.length > 0, 'the ownership banner'); count++;
assert.match(banner, /var _o = 'ClearSky Energy Solutions LLC';/); count++;
var code = banner.split('\n').filter(function (l) { return !/^\s*\/\//.test(l); }).join('\n');
assert.ok(code.indexOf('brandName(') < 0, 'the banner never names the white label as owner'); count++;
assert.match(banner, /Licensed, not sold/); count++;

/* the Terms the licence link points at say what the notice relies on */
var legal = read('omega-legal-docs.js');
assert.match(legal, /reverse engineer, decompile, disassemble/); count++;
assert.match(legal, /transmission is a technical requirement and not a publication/); count++;
assert.ok(fs.existsSync(path.join(ROOT, 'terms.html')), 'terms.html'); count++;

/* the doc is honest about what is not minified */
var claude = read('CLAUDE.md');
assert.ok(claude.indexOf('Shipped JS is NOT minified') >= 0, 'CLAUDE.md states the truth about minification'); count++;
assert.ok(claude.indexOf('minified in the Vercel build step') < 0); count++;
console.log('tcopyright: ' + count + ' assertions passed');
