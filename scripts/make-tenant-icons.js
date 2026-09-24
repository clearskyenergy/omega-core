#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   make-tenant-icons.js — a tenant's home-screen icons from its SVG marks.

   tenants/<slug>/icons/<app>-icon.svg  →  <app>-512.png, <app>-192.png,
   <app>-180.png and <app>-maskable-512.png, for every <app>-icon.svg in the
   folder (plant, office, customer). Rendered with the Chromium Playwright
   already uses for the render checks, so a tenant's mark is drawn by the
   same engine a phone draws it with; no rasterising dependency.

   The maskable icon is the mark at 80% on the mark's own background colour
   with square corners — Android cuts its own shape and needs the safe zone.
   The colour is read off the SVG's first <rect fill>, which is how every
   icon in this folder is drawn; a mark without one gets white.

   Run: node scripts/make-tenant-icons.js cleancell            */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var slug = process.argv[2];
if (!slug) { console.error('usage: node scripts/make-tenant-icons.js <tenant-slug>'); process.exit(2); }
var dir = path.join(ROOT, 'tenants', slug, 'icons');
var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })();
var chromium = require(PW).chromium;
var SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var CHROME = process.env.CHROME || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : chromium.executablePath());
(async function () {
  var b = await chromium.launch({ executablePath: CHROME });
  var svgs = fs.readdirSync(dir).filter(function (f) { return /-icon\.svg$/.test(f); });
  for (var i = 0; i < svgs.length; i++) {
    var app = svgs[i].replace(/-icon\.svg$/, ''), svg = fs.readFileSync(path.join(dir, svgs[i]), 'utf8');
    var bg = (/<rect[^>]*fill="(#[0-9a-fA-F]{6})"/.exec(svg) || [])[1] || '#ffffff';
    var page = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
    var sizes = [512, 192, 180];
    for (var s = 0; s < sizes.length; s++) {
      await page.setViewportSize({ width: sizes[s], height: sizes[s] });
      await page.setContent('<html><body style="margin:0;background:transparent">' + svg.replace('<svg ', '<svg width="' + sizes[s] + '" height="' + sizes[s] + '" ') + '</body></html>');
      await page.screenshot({ path: path.join(dir, app + '-' + sizes[s] + '.png'), omitBackground: true });
    }
    await page.setViewportSize({ width: 512, height: 512 });
    await page.setContent('<html><body style="margin:0;background:' + bg + ';display:flex;align-items:center;justify-content:center;width:512px;height:512px">' + svg.replace('<svg ', '<svg width="410" height="410" ') + '</body></html>');
    await page.screenshot({ path: path.join(dir, app + '-maskable-512.png') });
    await page.close();
    console.log(app + ': 512, 192, 180, maskable-512 written to tenants/' + slug + '/icons/');
  }
  await b.close();
})().catch(function (e) { console.error(e); process.exit(1); });
