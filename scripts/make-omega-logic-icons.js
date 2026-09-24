#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   make-omega-logic-icons.js — the Omega Logic app's home-screen icons from
   icons/omega-logic.svg (ClearSky's mark, the Hex grid Ω; the same on every tenant's phone):
   omega-logic-512.png, -192.png, -180.png and -maskable-512.png. The SVG is
   a full-bleed square tile, so iOS rounds it and Android masks it; the
   maskable copy is the same tile, which already keeps the mark in the
   central 80%. Rendered with the Chromium the render checks use.

   Run: node scripts/make-omega-logic-icons.js */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'icons'), SRC = path.join(OUT, 'omega-logic.svg');
var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })();
var chromium = require(PW).chromium, SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var CHROME = process.env.CHROME || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : chromium.executablePath());
(async function () {
  var svg = fs.readFileSync(SRC, 'utf8'), b = await chromium.launch({ executablePath: CHROME }), page = await b.newPage();
  var jobs = [['omega-logic-512.png', 512], ['omega-logic-192.png', 192], ['omega-logic-180.png', 180], ['omega-logic-maskable-512.png', 512]];
  for (var i = 0; i < jobs.length; i++) {
    var size = jobs[i][1];
    await page.setViewportSize({ width: size, height: size });
    await page.setContent('<html><body style="margin:0;background:#050A11">' + svg.replace(/<svg /, '<svg style="display:block;width:' + size + 'px;height:' + size + 'px" ') + '</body></html>');
    await page.screenshot({ path: path.join(OUT, jobs[i][0]) });
    console.log('  icons/' + jobs[i][0] + '  ' + size + 'x' + size);
  }
  await b.close();
})().catch(function (e) { console.error(e); process.exit(1); });
