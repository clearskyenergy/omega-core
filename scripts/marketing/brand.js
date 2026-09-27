/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   brand.js — the LinkedIn page's logo and cover, rendered from the repo's
   own marks so they never drift from the product:

     logo-1200.png, logo-400.png   omega-logo.svg (the app icon) as a full
                                   square: LinkedIn rounds and crops a
                                   company logo itself, so the tile's own
                                   rounded clip is removed.
     cover-1128x191.png (+ @2x)    the cover: navy blueprint grid, the mark,
                                   the name and the line, kept clear of the
                                   bottom-left corner the logo covers.

     node scripts/marketing/brand.js [outDir]   (default scripts/marketing/out/brand)
   Never deployed. */
'use strict';
var fs = require('fs');
var path = require('path');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {
    var root = require('child_process').execSync('npm root -g').toString().trim();
    return require(path.join(root, 'playwright'));
  }
}

var HERE = __dirname;
var REPO = path.resolve(HERE, '..', '..');
var OUT = path.resolve(process.argv[2] || path.join(HERE, 'out', 'brand'));
function font(name) { return fs.readFileSync(path.join(HERE, 'fonts', name)).toString('base64'); }
var FONTS =
  "@font-face{font-family:Archivo;src:url(data:font/woff2;base64," + font('Archivo.woff2') + ") format('woff2');font-weight:100 900}" +
  "@font-face{font-family:Inter;src:url(data:font/woff2;base64," + font('Inter.woff2') + ") format('woff2');font-weight:100 900}" +
  "@font-face{font-family:Plex;src:url(data:font/woff2;base64," + font('IBMPlexMono.woff2') + ") format('woff2');font-weight:500}";

var ICON = fs.readFileSync(path.join(REPO, 'omega-logo.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
var SQUARE = ICON.replace('<rect width="512" height="512" rx="112"/>', '<rect width="512" height="512"/>');
if (SQUARE === ICON) throw new Error('omega-logo.svg changed: the tile clip was not found');
var MARK = fs.readFileSync(path.join(REPO, 'clearsky-omega-mark.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

function logoHtml(px) {
  return '<!doctype html><html><head><style>html,body{margin:0;background:#050A11}svg{display:block;width:' + px + 'px;height:' + px + 'px}</style></head><body>' + SQUARE + '</body></html>';
}

function coverHtml() {
  return '<!doctype html><html><head><meta charset="utf-8"><style>' + FONTS +
    'html,body{margin:0}' +
    '.c{width:1128px;height:191px;position:relative;overflow:hidden;background:#0b2733;color:#f2f6f8;font-family:Inter,sans-serif}' +
    '.g{position:absolute;inset:0;background-image:linear-gradient(rgba(134,189,240,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(134,189,240,.07) 1px,transparent 1px),linear-gradient(rgba(134,189,240,.13) 1px,transparent 1px),linear-gradient(90deg,rgba(134,189,240,.13) 1px,transparent 1px);background-size:12px 12px,12px 12px,60px 60px,60px 60px}' +
    '.f{position:absolute;inset:10px;border:1px solid rgba(233,240,244,.5)}' +
    '.row{position:absolute;left:300px;right:34px;top:0;bottom:0;display:flex;align-items:center;gap:22px}' +
    '.row svg{width:92px;height:92px;flex:none}' +
    '.t{display:flex;flex-direction:column;gap:6px}' +
    '.t b{font:800 44px/1 Archivo,sans-serif;letter-spacing:-.01em}' +
    '.t span{font:400 19px Inter,sans-serif;color:#c4d6e1}' +
    '.s{margin-left:auto;align-self:center;font:500 12px Plex,monospace;letter-spacing:.18em;color:#ff7a52;text-align:right;line-height:1.9}' +
    '</style></head><body><div class="c"><div class="g"></div><div class="f"></div><div class="row">' + MARK +
    '<div class="t"><b>ClearSky OMEGA</b><span>One record from parcel to funded project.</span></div>' +
    '<div class="s">SCREEN · DESIGN · SIZE<br>PRICE · FINANCE · OPERATE</div></div></div></body></html>';
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  var browser = await loadPlaywright().chromium.launch();
  var jobs = [
    { file: 'logo-1200.png', w: 1200, h: 1200, scale: 1, html: logoHtml(1200) },
    { file: 'logo-400.png', w: 400, h: 400, scale: 1, html: logoHtml(400) },
    { file: 'cover-1128x191.png', w: 1128, h: 191, scale: 1, html: coverHtml() },
    { file: 'cover-1128x191@2x.png', w: 1128, h: 191, scale: 2, html: coverHtml() }
  ];
  for (var i = 0; i < jobs.length; i++) {
    var j = jobs[i];
    var page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: j.scale });
    await page.setContent(j.html, { waitUntil: 'load' });
    await page.evaluate(function () { return document.fonts.ready; });
    await page.screenshot({ path: path.join(OUT, j.file), clip: { x: 0, y: 0, width: j.w, height: j.h } });
    await page.close();
    console.log('rendered', j.file);
  }
  await browser.close();
}
main().catch(function (e) { console.error(e); process.exit(1); });
