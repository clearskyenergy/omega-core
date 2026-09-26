#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Every ribbon button in editor.html has its own icon in omega-ribbon-icons.js:
 * none falls back to the generic placeholder ("we had logos for this earlier
 * and they were fine", Tommy, 2026-09-26). Static: the labels are read out of
 * the markup and the JS-built buttons the same way the page prints them. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var S = require('../../omega-ribbon-icons.js');
var src = fs.readFileSync(path.join(__dirname, '../../editor.html'), 'utf8');
function clean(t) { return t.replace(/<br\s*\/?>/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/\s+/g, ' ').trim(); }
var labels = {};
var re = /class="rb-lbl">([\s\S]*?)<\/span>/g, m;
while ((m = re.exec(src))) { var t = clean(m[1]); if (t && !/['+]/.test(t)) labels[t] = true; }
var re2 = /ribbonButton\('([^']+)',\s*'[^']*',\s*'([^']*)'/g;
while ((m = re2.exec(src))) { var t2 = clean(m[2]); if (t2 && !/['+]/.test(t2)) labels[t2] = true; }
var all = Object.keys(labels).sort(), missing = [], count = 0;
all.forEach(function (label) {
  var d = S.pathFor(label, label);
  if (d === S.FALLBACK) missing.push(label);
  assert.match(d, /^M[\d.\s\-a-zA-Z,]+$/, 'a path for ' + label); count++;
});
assert.ok(all.length >= 150, 'the ribbon has ' + all.length + ' labels');
assert.deepEqual(missing, [], 'every ribbon button has its own icon; missing: ' + missing.join(' | '));
/* the dynamic buttons name their mode; the prefixes catch them */
['Intercon Service Pt', 'Intercon Substation', 'Intercon None', 'Load Bar 2.4 MW'].forEach(function (l) { assert.notEqual(S.pathFor(l, l), S.FALLBACK, l); count++; });
/* the page loads the set before the module that draws with it, and marks a stranger */
assert.ok(src.indexOf('<script src="/omega-ribbon-icons.js?v=1"></script>\n<script id="omega-ribbon-icons-js">') >= 0, 'the icon set loads first'); count++;
assert.ok(/data-icon-fallback/.test(src), 'a button the set does not know is marked'); count++;
/* no two labels of different meaning share a picture by accident: the equipment ones are distinct */
var distinct = ['Trace Boundary', 'Add Exclusion', 'Place Substation', 'Supply Link', 'Move System', 'Electrical Sizing', 'Load Screen', 'Land Lease', 'EV Stencil', 'ADA Symbol', 'ADA Aisle', 'Transformer', 'Meter'].map(function (l) { return S.pathFor(l, l); });
assert.equal(new Set(distinct).size, distinct.length, 'the key site and equipment icons are all different'); count++;
console.log('ribbon icons: ' + all.length + ' labels, every one drawn; ' + count + ' checks passed.');
