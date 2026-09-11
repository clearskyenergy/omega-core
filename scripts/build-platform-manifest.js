#!/usr/bin/env node
/* ============================================================================
   build-platform-manifest.js — what OMEGA is actually made of.

   Walks the repo root, reads each tool's own <title>, and writes
   assets/platform.json. The dashboard draws its platform map from this, so
   the map is generated from the codebase rather than typed out beside it —
   a hand-kept list of your own product is a list that is wrong within a
   fortnight.

   Areas are assigned from a small prefix table. A file that matches nothing
   lands in "other" and SHOWS there, rather than being dropped: a tool missing
   from the map is worse than one filed under the wrong heading.

       node scripts/build-platform-manifest.js
   © 2025-2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   ========================================================================== */

'use strict';

var fs = require('fs');
var path = require('path');
var execSync = require('child_process').execSync;

var ROOT = path.join(__dirname, '..');
var OUT = path.join(ROOT, 'assets', 'platform.json');

/* Not tools: the shell, the gate, and the twin's own two surfaces.

   cameras.html is in the repo but is not part of the product either — it is
   one person's Ring wall, not something a tenant is ever gated into. Listing
   it on the OMEGA map would put it in front of every reader of that map and
   imply it ships with the platform. */
var SKIP = ['mission.html', 'jarvis.html', 'login.html', 'index.html',
            'start.html', '404.html', 'cameras.html'];

/* ONLY WHAT IS ACTUALLY IN THE REPO.

   Reading the directory picks up anything sitting in the working tree — a
   scratch copy, a download, a file from another project — and puts it on the
   map of OMEGA as though it were part of the product. Ask git instead: the
   manifest then lists what omega-core CONTAINS, not what happens to be on
   this laptop. */
function trackedHtml() {
  var out = execSync('git ls-files -- "*.html"', { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n')
    .map(function (f) { return f.trim(); })
    .filter(Boolean)
    /* Root only. /tenants, /admin, /console and /shells are extensions and
       shells, not tools on the marketplace. */
    .filter(function (f) { return f.indexOf('/') === -1; });
}

var AREAS = [
  ['Design',    ['editor', 'ClearSky_Enlarged', 'permit', 'stencil']],
  ['Siting',    ['sitefinder', 'grid-atlas', 'comed', 'site-discovery', 'site-optimizer', 'greenfield']],
  ['Sizing',    ['battery-sizer', 'compute-power', 'edge-fund', 'conductor', 'power-flow', 'interconnection']],
  ['Economics', ['cost-estimator', 'proforma', 'valuestack', 'ev-cost', 'apartment-bess', 'degradation']],
  ['Sell',      ['sales-proposal', 'marketplace', 'quote', 'rfq']],
  ['Operate',   ['om-console', 'field-service', 'fleet', 'sla-', 'owner-reporting', 'site-lifecycle']],
  ['Admin',     ['intake-admin', 'projects', 'account', 'admin', 'tenant', 'user-']]
];

function areaOf(file) {
  var f = file.toLowerCase();
  for (var i = 0; i < AREAS.length; i++) {
    var hits = AREAS[i][1];
    for (var j = 0; j < hits.length; j++) {
      if (f.indexOf(hits[j].toLowerCase()) !== -1) return AREAS[i][0];
    }
  }
  return 'Other';
}

function titleOf(src, file) {
  var m = src.slice(0, 8000).match(/<title>([\s\S]*?)<\/title>/i);
  if (!m) return file.replace(/\.html$/, '');
  return m[1]
    .replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&mdash;/g, '—')
    .replace(/\s*[·—|-]+\s*ClearSky[- ]?OMEGA\s*$/i, '')
    .replace(/^ClearSky[- ]?OMEGA\s*[·—|-]+\s*/i, '')
    /* Stripping the brand off "ClearSky OMEGA -- Site Map Designer Pro" leaves
       the dash behind, and a tool called "- Site Map Designer Pro" looks like
       a bug because it is one. */
    .replace(/^[\s·—|-]+/, '').replace(/[\s·—|-]+$/, '')
    .replace(/\s+/g, ' ').trim();
}

var rows = trackedHtml()
  .filter(function (f) { return SKIP.indexOf(f) === -1; })
  .map(function (f) {
    var p = path.join(ROOT, f);
    var src = fs.readFileSync(p, 'utf8');
    var st = fs.statSync(p);
    return {
      file: f,
      title: titleOf(src, f),
      area: areaOf(f),
      kb: Math.round(st.size / 1024),
      /* A rough measure of how much is going on in there, which is the thing
         you actually want to know before asking for a change. */
      scripts: (src.match(/<script\b/gi) || []).length,
      lines: src.split('\n').length
    };
  })
  .sort(function (a, b) { return b.kb - a.kb; });

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  repo: 'omega-core',
  tools: rows
}, null, 2));

console.log('wrote ' + OUT + '  (' + rows.length + ' tools, all tracked in omega-core)');
var byArea = {};
rows.forEach(function (r) { byArea[r.area] = (byArea[r.area] || 0) + 1; });
Object.keys(byArea).forEach(function (a) { console.log('  ' + a.padEnd(11) + byArea[a]); });
