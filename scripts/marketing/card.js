/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   card.js — renders the LinkedIn graphics for the go-to-market calendar.
   Input: a JSON file of card specs (written by build.py from content.py).
   Output: one 1080×1350 PNG per card (LinkedIn's 4:5 portrait), and for a
   carousel a PDF of its slides plus a PNG of the cover (LinkedIn posts a
   PDF as a swipeable document).

     node scripts/marketing/card.js <cards.json> <outDir> [id ...]

   The look is the marketing site's drawing sheet: navy ground, blueprint
   grid, a border, the neon OMEGA mark and a title block. Fonts are the
   site's own (Archivo, Inter, IBM Plex Mono) from ./fonts, embedded, so a
   render never depends on the network. Never deployed. */
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
function font(name) { return fs.readFileSync(path.join(HERE, 'fonts', name)).toString('base64'); }
var FONTS =
  "@font-face{font-family:Archivo;src:url(data:font/woff2;base64," + font('Archivo.woff2') + ") format('woff2');font-weight:100 900}" +
  "@font-face{font-family:Inter;src:url(data:font/woff2;base64," + font('Inter.woff2') + ") format('woff2');font-weight:100 900}" +
  "@font-face{font-family:Plex;src:url(data:font/woff2;base64," + font('IBMPlexMono.woff2') + ") format('woff2');font-weight:500}";
var MARK = fs.readFileSync(path.join(REPO, 'clearsky-omega-mark.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}

var CSS = FONTS + [
  'html,body{margin:0;background:#0b2733}',
  '.card{width:1080px;height:1350px;position:relative;background:#0b2733;color:#f2f6f8;overflow:hidden;font-family:Inter,sans-serif}',
  '.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(134,189,240,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(134,189,240,.07) 1px,transparent 1px),linear-gradient(rgba(134,189,240,.13) 1px,transparent 1px),linear-gradient(90deg,rgba(134,189,240,.13) 1px,transparent 1px);background-size:30px 30px,30px 30px,150px 150px,150px 150px;background-position:40px 40px}',
  '.frame{position:absolute;inset:40px;border:2px solid rgba(233,240,244,.6);display:flex;flex-direction:column}',
  '.body{flex:1;min-height:0;padding:60px 58px 48px;display:flex;flex-direction:column;gap:34px;overflow:hidden}',
  '.main{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:40px}',
  '.eyebrow{font:500 23px Plex,monospace;letter-spacing:.14em;color:#ff7a52;text-transform:uppercase}',
  'h1{font:800 108px/1.0 Archivo,sans-serif;letter-spacing:-.018em;margin:0;text-wrap:balance}',
  '.sub{font:400 40px/1.36 Inter,sans-serif;color:#c4d6e1;max-width:920px;text-wrap:pretty}',
  '.big{font:500 170px/1 Plex,monospace;color:#ff7a52;letter-spacing:-.03em}',
  '.spacer{flex:1}',
  '.kicker{font:700 34px Archivo,sans-serif;color:#ff7a52;border-top:2px solid rgba(255,122,82,.7);padding-top:22px}',
  '.rows{display:flex;flex-direction:column;border-top:1px solid rgba(233,240,244,.28)}',
  '.row{display:grid;grid-template-columns:1fr 48px 1fr;align-items:center;gap:10px;padding:24px 0;border-bottom:1px solid rgba(233,240,244,.28);font:400 34px/1.25 Inter,sans-serif}',
  '.row .l{color:#9fb6c3}.row .a{color:#ff7a52;font:500 34px Plex,monospace;text-align:center}.row .r{font-weight:600;color:#fff}',
  '.row.solo{grid-template-columns:1fr}',
  '.rows.dense .row{padding:20px 0;font-size:30px}.rows.dense .row .a{font-size:30px}',
  '.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}',
  '.col{border:2px solid rgba(233,240,244,.4);padding:30px 28px 36px;display:flex;flex-direction:column;gap:20px}',
  '.col.hot{border-color:#ff7a52}',
  '.col h2{margin:0;font:500 22px Plex,monospace;letter-spacing:.12em;text-transform:uppercase;color:#9fb6c3}.col.hot h2{color:#ff7a52}',
  '.col ul{margin:0;padding-left:28px;display:flex;flex-direction:column;gap:20px;font:400 33px/1.3 Inter,sans-serif}',
  '.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}',
  '.tile{border:2px dashed rgba(233,240,244,.35);color:#9fb6c3;font:500 23px Plex,monospace;letter-spacing:.02em;padding:38px 6px;text-align:center}',
  '.arrow{font:500 46px Plex,monospace;color:#ff7a52;text-align:center;line-height:1}',
  '.one{border:3px solid #ff7a52;padding:40px 34px;display:flex;align-items:center;gap:26px}',
  '.one svg{width:110px;height:110px;flex:none}.one b{font:800 56px Archivo,sans-serif;display:block}.one span{font:400 30px/1.35 Inter,sans-serif;color:#c4d6e1}',
  '.page{font:500 22px Plex,monospace;color:#9fb6c3;letter-spacing:.1em}',
  '.tb{display:grid;grid-template-columns:auto 1fr auto;border-top:2px solid rgba(233,240,244,.6);font:500 19px Plex,monospace;letter-spacing:.08em}',
  '.tb>div{padding:16px 22px;border-right:1px solid rgba(233,240,244,.35);display:flex;flex-direction:column;gap:5px;justify-content:center;min-width:0}',
  '.tb>div:last-child{border-right:0}',
  '.tb span{color:#8fa9b8;font-size:14px;letter-spacing:.16em}',
  '.tb .brand{flex-direction:row;align-items:center;gap:12px}',
  '.tb .brand svg{width:52px;height:52px}',
  '.tb .brand b{font:800 27px Archivo,sans-serif;letter-spacing:.01em;white-space:nowrap}'
].join('\n');

function titleBlock(c) {
  return '<div class="tb"><div class="brand">' + MARK + '<b>ClearSky OMEGA</b></div>' +
    '<div><span>SHEET ' + esc(c.sheet || '') + '</span>' + esc(c.project || 'Ditch the stack') + '</div>' +
    '<div><span>WEB</span>clearskyomega.com</div></div>';
}

function inner(c) {
  var top = '';
  if (c.eyebrow) top += '<div class="eyebrow">' + esc(c.eyebrow) + '</div>';
  if (c.page) top += '<div class="page">' + esc(c.page) + '</div>';
  var h = '';
  if (c.kind === 'stack') {
    h += '<h1>' + esc(c.headline) + '</h1>';
    h += '<div class="tiles">' + (c.tiles || []).map(function (t) { return '<div class="tile">' + esc(t) + '</div>'; }).join('') + '</div>';
    h += '<div class="arrow">↓</div>';
    h += '<div class="one">' + MARK + '<div><b>' + esc(c.oneTitle || 'One record') + '</b><span>' + esc(c.oneSub || '') + '</span></div></div>';
  } else if (c.kind === 'list') {
    h += '<h1 style="font-size:88px">' + esc(c.headline) + '</h1>';
    h += '<div class="rows' + ((c.rows || []).length > 5 ? ' dense' : '') + '">' + (c.rows || []).map(function (r) {
      return r.length > 1
        ? '<div class="row"><div class="l">' + esc(r[0]) + '</div><div class="a">→</div><div class="r">' + esc(r[1]) + '</div></div>'
        : '<div class="row solo"><div class="r">' + esc(r[0]) + '</div></div>';
    }).join('') + '</div>';
  } else if (c.kind === 'compare') {
    h += '<h1 style="font-size:92px">' + esc(c.headline) + '</h1>';
    h += '<div class="cols">' + (c.cols || []).map(function (col, i) {
      return '<div class="col' + (i === 1 ? ' hot' : '') + '"><h2>' + esc(col.title) + '</h2><ul>' +
        col.items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    }).join('') + '</div>';
  } else {
    if (c.big) h += '<div class="big">' + esc(c.big) + '</div>';
    h += '<h1>' + esc(c.headline) + '</h1>';
    if (c.sub) h += '<div class="sub">' + esc(c.sub) + '</div>';
  }
  return top + '<div class="main">' + h + '</div>' + (c.kicker ? '<div class="kicker">' + esc(c.kicker) + '</div>' : '');
}

function cardHtml(c) {
  return '<div class="card"><div class="grid"></div><div class="frame"><div class="body">' + inner(c) + '</div>' + titleBlock(c) + '</div></div>';
}

function doc(bodies) {
  return '<!doctype html><html><head><meta charset="utf-8"><style>' + CSS +
    '@page{size:1080px 1350px;margin:0}.card{page-break-after:always}</style></head><body>' + bodies.join('') + '</body></html>';
}

/* Shrink every headline until its card's body stops overflowing. */
function fit() {
  var cards = document.querySelectorAll('.card');
  for (var i = 0; i < cards.length; i++) {
    var body = cards[i].querySelector('.main');
    var h1 = cards[i].querySelector('h1');
    var sub = cards[i].querySelector('.sub');
    var guard = 0;
    while (body.scrollHeight > body.clientHeight + 1 && guard++ < 60) {
      if (h1) h1.style.fontSize = (parseFloat(getComputedStyle(h1).fontSize) - 3) + 'px';
      if (sub && guard > 20) sub.style.fontSize = (parseFloat(getComputedStyle(sub).fontSize) - 1) + 'px';
    }
    if (body.scrollHeight > body.clientHeight + 1) cards[i].setAttribute('data-overflow', '1');
  }
  return Array.prototype.map.call(cards, function (c) { return !!c.getAttribute('data-overflow'); });
}

async function main() {
  var args = process.argv.slice(2);
  if (args.length < 2) { console.error('usage: node card.js <cards.json> <outDir> [id ...]'); process.exit(2); }
  var specs = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  var only = args.slice(2);
  if (only.length) specs = specs.filter(function (c) { return only.indexOf(c.id) >= 0; });
  fs.mkdirSync(args[1], { recursive: true });
  var pw = loadPlaywright();
  var browser = await pw.chromium.launch();
  var page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  var failed = [];
  for (var i = 0; i < specs.length; i++) {
    var c = specs[i];
    var slides = c.kind === 'carousel' ? c.slides.map(function (s, n) {
      return Object.assign({ sheet: c.sheet, project: c.project, page: String(n + 1).padStart(2, '0') + ' / ' + String(c.slides.length).padStart(2, '0') }, s);
    }) : [c];
    await page.setContent(doc(slides.map(cardHtml)), { waitUntil: 'load' });
    await page.evaluate(function () { return document.fonts.ready; });
    var over = await page.evaluate(fit);
    if (over.some(Boolean)) failed.push(c.id);
    var cards = await page.$$('.card');
    await cards[0].screenshot({ path: path.join(args[1], c.id + '.png') });
    if (c.kind === 'carousel') {
      for (var s = 1; s < cards.length; s++) await cards[s].screenshot({ path: path.join(args[1], c.id + '-' + (s + 1) + '.png') });
      await page.pdf({ path: path.join(args[1], c.id + '.pdf'), width: '1080px', height: '1350px', printBackground: true });
    }
    console.log('rendered', c.id, slides.length > 1 ? '(' + slides.length + ' slides)' : '');
  }
  await browser.close();
  if (failed.length) { console.error('text overflows its card: ' + failed.join(', ')); process.exit(1); }
}
main().catch(function (e) { console.error(e); process.exit(1); });
