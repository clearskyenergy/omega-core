#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   make-omega-prime-icons.js — Omega Prime's home-screen icons from
   icons/omega-prime.svg: 512, 192, 180 (apple-touch) and a maskable 512
   whose mark is inset further so Android's circle crop keeps the hex.
   No build step on deploy; the PNGs in icons/ are what the manifest ships.
   Rendered with the Chromium the render checks use.

   Run: node scripts/make-omega-prime-icons.js */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'icons'), SRC = path.join(OUT, 'omega-prime.svg');
var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright'); } catch (e) { try { return require.resolve('playwright-core'); } catch (e2) { return '/tmp/tools/node_modules/playwright-core'; } } })();
var chromium = require(PW).chromium;
var CHROME = process.env.CHROME || (fs.existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : chromium.executablePath());

function pageFor(svg, size, scale) {
  var body = svg.replace(/<svg /, '<svg style="display:block;width:' + size + 'px;height:' + size + 'px" ');
  if (scale && scale !== 1) {
    body = body.replace('<g fill="none"', '<g fill="none" transform="translate(256 256) scale(' + scale + ') translate(-256 -256)"');
  }
  return '<!doctype html><html><head><style>html,body{margin:0;width:' + size + 'px;height:' + size + 'px;overflow:hidden;background:#0B2A3D}</style></head><body>' + body + '</body></html>';
}

(async function () {
  var svg = fs.readFileSync(SRC, 'utf8');
  var browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  var jobs = [
    ['omega-prime-512.png', 512, 1],
    ['omega-prime-192.png', 192, 1],
    ['omega-prime-180.png', 180, 1],
    ['omega-prime-maskable-512.png', 512, 0.82]
  ];
  for (var i = 0; i < jobs.length; i++) {
    var size = jobs[i][1];
    var page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(pageFor(svg, size, jobs[i][2]), { waitUntil: 'load' });
    var file = path.join(OUT, jobs[i][0]);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log('  icons/' + jobs[i][0] + '  ' + size + 'x' + size);
  }
  await browser.close();
})().catch(function (e) { console.error(e); process.exit(1); });
