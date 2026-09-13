#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════════
   scripts/build-skyfund-sandbox.js — a phone-testable SkyFund with no backend
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Takes the REAL storefront (portals/skyfund/index.html), swaps its three
   external dependencies — the Firebase SDK, /api/invest, Stripe — for
   scripts/skyfund-sandbox/shim.js, and writes a folder that runs from any
   static host or a claude.ai Artifact link. Sign-in, checkout and
   distributions are simulated on the device; the four sample projects are
   real; every money figure was computed HERE, once, by the real engine
   (api/_lib/invest-math.js) per unit, so the engine itself never ships.

     node scripts/build-skyfund-sandbox.js [outDir]     default: scripts/out/skyfund-sandbox

   Output:  index.html, sponsor.html, samples.js, sandbox.js, sw.js,
            manifest.webmanifest, brand/ (icon SVG + PNGs) — publish as-is.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var IM = require(path.join(ROOT, 'api', '_lib', 'invest-math.js'));
var SAMPLES = require(path.join(ROOT, 'portals', 'skyfund', 'samples.js'));
/* The fifth listing: still a draft, so the sponsor console has the half of
   the product that happens before a campaign is visible. Priced here with
   the others so its launch shows the engine's real figures. */
var DRAFT = require(path.join(__dirname, 'skyfund-sandbox', 'draft-sample.js'));

/* Per-unit projection tables: outputs of the engine, one unit each. The shim
   multiplies by the units held; IRR, MOIC, yield and payback do not change
   with scale, so they are carried as-is. */
function buildProj() {
  var out = {};
  SAMPLES.concat([DRAFT]).forEach(function (s) {
    var t = IM.terms(s), p = IM.projection(s, 1);
    out[s.id] = {
      unitPrice: t.unitPrice, unitsTotal: t.unitsTotal, sharePct: t.sharePct, kind: t.kind, termYears: t.termYears, codMonths: t.codMonths,
      distributableAnnual: t.distributableAnnual,
      perUnitYears: p.years.map(function (y) { return y.distribution; }),
      perUnitAnnual: p.annualDistribution, perUnitTotal: p.total,
      yieldPct: p.yieldPct, irrPct: p.irrPct, moic: p.moic, paybackYear: p.paybackYear
    };
  });
  return out;
}

/* Both pages boot the same way: the Firebase SDK, /config.js, then their own
   script. The shim replaces the first two, so they come out. */
function stripBoot(s) {
  s = s.replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>\n?/g, '');
  return s;
}

/* The page, with its script tags and root paths pointed at the folder. */
function transformPage(html) {
  var s = stripBoot(html);
  s = s.replace('<script src="/config.js"></script>\n', '');
  s = s.replace('<script src="/portals/skyfund/samples.js"></script>', '<script src="samples.js"></script>\n<script src="sandbox.js"></script>');
  s = s.replace(/\/portals\/skyfund\/brand\//g, 'brand/');
  s = s.replace('/portals/skyfund/manifest.webmanifest', 'manifest.webmanifest');
  s = s.replace(/\/portals\/skyfund\/sponsor/g, 'sponsor.html');
  s = s.replace("var swUrl = '/portals/skyfund/sw.js', swScope = '/skyfund';", "var swUrl = 'sw.js', swScope = './';");
  s = s.replace(/<title>[^<]*<\/title>/, '<title>SkyFund Sandbox</title>');
  s = s.replace('<meta name="apple-mobile-web-app-title" content="SkyFund">', '<meta name="apple-mobile-web-app-title" content="SkyFund Sandbox">');
  if (s.indexOf('sandbox.js') < 0 || /www\.gstatic\.com\/firebasejs/.test(s) || /"\/config\.js"/.test(s)) throw new Error('transform did not take — the page changed shape; update build-skyfund-sandbox.js');
  return s;
}

/* The sponsor console. Same treatment, plus the two links out of the sandbox
   (the OMEGA portal, and the storefront at its real path) pointed home. */
function transformSponsor(html) {
  var s = stripBoot(html);
  s = s.replace('<script src="/config.js"></script>', '<script src="samples.js"></script>\n<script src="sandbox.js"></script>');
  s = s.replace(/\/portals\/skyfund\/brand\//g, 'brand/');
  /* "View on the storefront" is /portals/skyfund/#/c/{id}; the console's own
     brand and Storefront links are the bare path. Both come home. */
  s = s.replace(/\/portals\/skyfund\/#/g, 'index.html#');
  s = s.replace(/href="\/portals\/skyfund\/"/g, 'href="index.html"');
  s = s.replace('<a class="lnk" href="/" id="backPortal">Portal</a>\n', '');
  s = s.replace(/<title>[^<]*<\/title>/, '<title>SkyFund Sponsor · Sandbox</title>');
  if (s.indexOf('sandbox.js') < 0 || /www\.gstatic\.com\/firebasejs/.test(s) || /"\/config\.js"/.test(s) || /\/portals\/skyfund\//.test(s))
    throw new Error('sponsor transform did not take — the page changed shape; update build-skyfund-sandbox.js');
  return s;
}

function build(outDir) {
  outDir = outDir || path.join(__dirname, 'out', 'skyfund-sandbox');
  fs.mkdirSync(outDir, { recursive: true });
  var page = transformPage(fs.readFileSync(path.join(ROOT, 'portals', 'skyfund', 'index.html'), 'utf8'));
  var shim = fs.readFileSync(path.join(__dirname, 'skyfund-sandbox', 'shim.js'), 'utf8');
  var sandbox = '/* SkyFund sandbox — generated by scripts/build-skyfund-sandbox.js on ' + new Date().toISOString() + '. Do not edit; edit shim.js. */\n' +
    'window.SKYFUND_PROJ = ' + JSON.stringify(buildProj()) + ';\n' +
    'window.SKYFUND_DRAFT = ' + JSON.stringify(DRAFT) + ';\n' + shim;
  var manifest = { name: 'SkyFund Sandbox', short_name: 'SkyFund', description: 'Try the SkyFund investor app. Nothing is real.',
    start_url: './', scope: './', display: 'standalone', orientation: 'portrait', background_color: '#16202B', theme_color: '#16202B',
    icons: [{ src: 'brand/skyfund-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'brand/skyfund-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'brand/skyfund-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
  fs.writeFileSync(path.join(outDir, 'index.html'), page);
  fs.writeFileSync(path.join(outDir, 'sponsor.html'), transformSponsor(fs.readFileSync(path.join(ROOT, 'portals', 'skyfund', 'sponsor.html'), 'utf8')));
  fs.writeFileSync(path.join(outDir, 'sandbox.js'), sandbox);
  fs.writeFileSync(path.join(outDir, 'samples.js'), fs.readFileSync(path.join(ROOT, 'portals', 'skyfund', 'samples.js')));
  fs.writeFileSync(path.join(outDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'sw.js'), fs.readFileSync(path.join(ROOT, 'portals', 'skyfund', 'sw.js')));
  /* The brand folder travels with the page: icon SVG for the top bar, PNGs for the home screen. */
  var brandSrc = path.join(ROOT, 'portals', 'skyfund', 'brand'), brandOut = path.join(outDir, 'brand');
  fs.mkdirSync(brandOut, { recursive: true });
  fs.readdirSync(brandSrc).forEach(function (f) { if (/\.(svg|png)$/.test(f)) fs.copyFileSync(path.join(brandSrc, f), path.join(brandOut, f)); });
  return outDir;
}

module.exports = { buildProj: buildProj, transformPage: transformPage, transformSponsor: transformSponsor, build: build, DRAFT: DRAFT };

if (require.main === module) {
  var dir = build(process.argv[2]);
  console.log('SkyFund sandbox written to ' + dir);
  fs.readdirSync(dir).forEach(function (f) { console.log('  ' + f + '  ' + fs.statSync(path.join(dir, f)).size + ' bytes'); });
}
