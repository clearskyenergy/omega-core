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
  /* game kinds */
  '.move{display:flex;align-items:center;gap:18px;border:2px solid #ff7a52;padding:18px 22px;font:600 31px/1.25 Inter,sans-serif}',
  '.move span{flex:none;font:500 19px Plex,monospace;letter-spacing:.16em;color:#0b2733;background:#ff7a52;padding:8px 12px}',
  '.opts{display:grid;grid-template-columns:1fr 1fr;gap:18px}',
  '.opt{border:2px solid rgba(233,240,244,.45);padding:26px 24px;display:flex;gap:20px;align-items:center;font:600 34px/1.2 Inter,sans-serif}',
  '.opt b{flex:none;width:64px;height:64px;display:grid;place-items:center;border:2px solid #ff7a52;color:#ff7a52;font:500 34px Plex,monospace}',
  '.checks{display:flex;flex-direction:column;gap:20px}',
  '.chk{display:flex;align-items:center;gap:22px;font:400 37px/1.2 Inter,sans-serif}',
  '.chk i{flex:none;width:46px;height:46px;border:3px solid #c4d6e1;border-radius:4px}',
  '.scale{display:flex;gap:12px;flex-wrap:wrap}',
  '.scale div{flex:1;border:2px solid rgba(233,240,244,.4);padding:14px 16px;display:flex;flex-direction:column;gap:4px;font:700 30px Archivo,sans-serif}',
  '.scale div span{font:500 20px Plex,monospace;color:#9fb6c3;letter-spacing:.08em}',
  '.scale div:last-child{border-color:#ff7a52;color:#ff7a52}',
  '.score{font:500 26px Plex,monospace;letter-spacing:.1em;color:#9fb6c3}.score b{color:#fff;font-size:44px;letter-spacing:.04em}',
  '.board{display:flex;flex-direction:column;gap:12px}',
  '.lb{display:grid;grid-template-columns:70px 190px 1fr 90px;align-items:center;gap:18px;font:500 30px Plex,monospace}',
  '.lb .rk{color:#9fb6c3}.lb .nm{color:#fff;font-family:Inter,sans-serif;font-weight:600}.lb .sc{text-align:right}',
  '.lb .bar{height:30px;background:rgba(134,189,240,.15);position:relative}.lb .bar i{position:absolute;inset:0 auto 0 0;background:#86bdf0}',
  '.lb.top .rk,.lb.top .sc{color:#ff7a52}.lb.top .bar i{background:#ff7a52}',
  '.lb.cut{opacity:.55}',
  '.note{font:500 20px Plex,monospace;letter-spacing:.14em;color:#9fb6c3;text-transform:uppercase}',
  '.watch{display:grid;grid-template-columns:360px 1fr;gap:40px;align-items:center}',
  '.watch svg{width:360px;height:400px}',
  '.laps{display:flex;flex-direction:column;gap:16px;font:400 32px/1.2 Inter,sans-serif}',
  '.laps div{display:flex;gap:16px;align-items:center}.laps b{flex:none;font:500 22px Plex,monospace;color:#0b2733;background:#86bdf0;width:44px;height:44px;display:grid;place-items:center}',
  '.plan svg{width:100%;height:auto;display:block}',
  '.radar svg{width:100%;height:auto;display:block;max-height:560px}',
  '.res{display:flex;flex-direction:column;border-top:1px solid rgba(233,240,244,.28)}',
  '.res div{display:grid;grid-template-columns:1fr auto;gap:20px;padding:22px 0;border-bottom:1px solid rgba(233,240,244,.28);font:400 34px/1.2 Inter,sans-serif}',
  '.res div span{color:#9fb6c3}.res div b{font:500 36px Plex,monospace;color:#fff;text-align:right}',
  '.verdict{align-self:flex-start;font:700 38px Archivo,sans-serif;padding:14px 22px;border:3px solid currentColor}',
  '.verdict.go{color:#5ad39a}.verdict.maybe{color:#ffc857}.verdict.no{color:#ff5a4f}',
  '.stamp{font:500 22px Plex,monospace;letter-spacing:.14em;color:#ff7a52}',
  /* guest list: the waitlist behind the rope, OMEGA inside */
  '.gl{display:grid;grid-template-columns:1fr 1fr;gap:26px;align-items:start}',
  '.rope{grid-column:1/-1;height:70px}.rope svg{width:100%;height:70px;display:block}',
  '.wl{border:2px dashed rgba(233,240,244,.35);padding:24px 22px;display:flex;flex-direction:column;gap:16px}',
  '.wl h2,.in h2{margin:0;font:500 21px Plex,monospace;letter-spacing:.14em;text-transform:uppercase}',
  '.wl h2{color:#9fb6c3}.in h2{color:#ff7a52}',
  '.wl div{display:flex;gap:12px;font:400 28px/1.25 Inter,sans-serif;color:#8fa9b8}',
  '.wl div span{flex:none;font:500 19px Plex,monospace;color:#6f8796;padding-top:6px;width:84px}',
  '.in{border:3px solid #ff7a52;padding:24px 22px;position:relative;display:flex;flex-direction:column;gap:16px}',
  '.in div{display:flex;gap:12px;font:600 29px/1.25 Inter,sans-serif;color:#fff}.in div b{color:#5ad39a;flex:none}',
  '.youre{position:absolute;right:-16px;top:-30px;transform:rotate(7deg);background:#ff7a52;color:#0b2733;font:800 27px Archivo,sans-serif;padding:8px 16px;letter-spacing:.03em}',
  '.big.strike{color:#9fb6c3;text-decoration:line-through;text-decoration-thickness:14px;text-decoration-color:#ff7a52}',
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
  } else if (c.kind === 'quiz') {
    h += '<h1 style="font-size:88px">' + esc(c.headline) + '</h1>';
    h += '<div class="opts">' + (c.options || []).map(function (o, i) { return '<div class="opt"><b>' + 'ABCD'[i] + '</b>' + esc(o) + '</div>'; }).join('') + '</div>';
  } else if (c.kind === 'checklist') {
    h += '<h1 style="font-size:84px">' + esc(c.headline) + '</h1>';
    h += '<div class="checks">' + (c.items || []).map(function (x) { return '<div class="chk"><i></i>' + esc(x) + '</div>'; }).join('') + '</div>';
    h += '<div class="score">YOUR SCORE <b>__ / ' + (c.items || []).length + '</b></div>';
    if (c.scale) h += '<div class="scale">' + c.scale.map(function (x) { return '<div><span>' + esc(x[0]) + '</span>' + esc(x[1]) + '</div>'; }).join('') + '</div>';
  } else if (c.kind === 'leaderboard') {
    h += '<h1 style="font-size:88px">' + esc(c.headline) + '</h1>';
    if (c.note) h += '<div class="note">' + esc(c.note) + '</div>';
    h += '<div class="board">' + (c.rows || []).map(function (r, i) {
      var cls = i < 3 ? ' top' : (r[2] ? ' cut' : '');
      return '<div class="lb' + cls + '"><span class="rk">' + esc(r[3] || ('#' + (i + 1))) + '</span><span class="nm">' + esc(r[0]) + '</span><span class="bar"><i style="width:' + Math.max(0, Math.min(100, r[1])) + '%"></i></span><span class="sc">' + esc(r[1]) + '</span></div>';
    }).join('') + '</div>';
    if (c.more) h += '<div class="note">' + esc(c.more) + '</div>';
  } else if (c.kind === 'stopwatch') {
    h += '<h1 style="font-size:92px">' + esc(c.headline) + '</h1>';
    h += '<div class="watch">' + stopwatch(c.clock || '?:??') + '<div class="laps">' + (c.laps || []).map(function (x, i) { return '<div><b>' + (i + 1) + '</b>' + esc(x) + '</div>'; }).join('') + '</div></div>';
  } else if (c.kind === 'plan') {
    h += '<h1 style="font-size:84px">' + esc(c.headline) + '</h1>';
    h += '<div class="plan">' + sitePlan(c.variant, c.flag, c.flagText) + '</div>';
  } else if (c.kind === 'result') {
    /* A Drop a Site reply: what the screen found, as the founder read it
       off the tool. Results only; never how the screen works. */
    h += '<div class="stamp">SITE SCREENED ✓ ' + esc(c.entry || '') + '</div>';
    h += '<h1 style="font-size:84px">' + esc(c.headline) + '</h1>';
    h += '<div class="res">' + (c.rows || []).map(function (r) { return '<div><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') + '</div>';
    if (c.verdict) h += '<div class="verdict ' + esc(c.tone || 'maybe') + '">' + esc(c.verdict) + '</div>';
  } else if (c.kind === 'guestlist') {
    /* The joke is the waitlist, never a company: the left column holds
       phrases, not names. Queue numbers are part of the joke. */
    h += '<h1 style="font-size:84px">' + esc(c.headline) + '</h1>';
    h += '<div class="gl"><div class="rope">' + rope() + '</div>';
    h += '<div class="wl"><h2>The waitlist</h2>' + (c.waitlist || []).map(function (x, i) {
      return '<div><span>#' + (4312 + i * 977).toLocaleString('en-US') + '</span>' + esc(x) + '</div>'; }).join('') + '</div>';
    h += '<div class="in"><span class="youre">YOU\'RE IN</span><h2>Already inside</h2>' + (c.inside || []).map(function (x) {
      return '<div><b>✓</b>' + esc(x) + '</div>'; }).join('') + '</div></div>';
  } else if (c.kind === 'drop') {
    h += '<div class="radar">' + radar() + '</div>';
    h += '<h1>' + esc(c.headline) + '</h1>';
    if (c.sub) h += '<div class="sub">' + esc(c.sub) + '</div>';
  } else {
    if (c.big) h += '<div class="big' + (c.strike ? ' strike' : '') + '">' + esc(c.big) + '</div>';
    h += '<h1>' + esc(c.headline) + '</h1>';
    if (c.sub) h += '<div class="sub">' + esc(c.sub) + '</div>';
  }
  var foot = (c.kicker ? '<div class="kicker">' + esc(c.kicker) + '</div>' : '') +
    (c.prompt ? '<div class="move"><span>YOUR MOVE</span>' + esc(c.prompt) + '</div>' : '');
  return top + '<div class="main">' + h + '</div>' + foot;
}


/* A stopwatch face: the clock text in the middle, twelve ticks, a crown. */
function stopwatch(clock) {
  var ticks = '';
  for (var i = 0; i < 12; i++) {
    var a = i * Math.PI / 6, r1 = 150, r2 = i % 3 ? 138 : 126;
    ticks += '<line x1="' + (180 + r1 * Math.sin(a)).toFixed(1) + '" y1="' + (220 - r1 * Math.cos(a)).toFixed(1) + '" x2="' + (180 + r2 * Math.sin(a)).toFixed(1) + '" y2="' + (220 - r2 * Math.cos(a)).toFixed(1) + '" stroke="#c4d6e1" stroke-width="' + (i % 3 ? 3 : 6) + '"/>';
  }
  return '<svg viewBox="0 0 360 400" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="160" y="18" width="40" height="30" fill="#c4d6e1"/><rect x="150" y="8" width="60" height="14" fill="#c4d6e1"/>' +
    '<circle cx="180" cy="220" r="165" fill="none" stroke="#ff7a52" stroke-width="10"/>' + ticks +
    '<text x="180" y="245" text-anchor="middle" font-family="Plex,monospace" font-weight="500" font-size="84" fill="#ffffff">' + esc(clock) + '</text></svg>';
}

/* A velvet rope between two brass posts: the line everyone else is in. */
function rope() {
  var post = function (x) {
    return '<rect x="' + (x - 7) + '" y="14" width="14" height="52" rx="3" fill="#c9a24a"/><circle cx="' + x + '" cy="12" r="11" fill="#e3c56f"/><rect x="' + (x - 18) + '" y="62" width="36" height="7" rx="3" fill="#c9a24a"/>';
  };
  return '<svg viewBox="0 0 960 70" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M24 18 Q 252 66 480 18" fill="none" stroke="#b3263a" stroke-width="9" stroke-linecap="round"/>' +
    '<path d="M480 18 Q 708 66 936 18" fill="none" stroke="#b3263a" stroke-width="9" stroke-linecap="round" opacity=".35"/>' +
    post(24) + post(480) + '</svg>';
}

/* A radar sweep around a dropped pin: the screen, drawn, no data on it. */
function radar() {
  var rings = '';
  for (var r = 60; r <= 240; r += 60) rings += '<circle cx="480" cy="270" r="' + r + '" fill="none" stroke="rgba(134,189,240,.35)" stroke-width="2"/>';
  var dots = [[610, 180], [360, 360], [560, 420], [300, 170], [680, 330]].map(function (d, i) {
    return '<rect x="' + (d[0] - 9) + '" y="' + (d[1] - 9) + '" width="18" height="18" fill="none" stroke="' + (i === 0 ? '#ff7a52' : '#86bdf0') + '" stroke-width="3"/>';
  }).join('');
  return '<svg viewBox="0 0 960 540" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="sw" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(480 270) scale(240)"><stop offset="0" stop-color="#ff7a52" stop-opacity=".0"/><stop offset="1" stop-color="#ff7a52" stop-opacity=".45"/></radialGradient></defs>' +
    rings + '<line x1="220" y1="270" x2="740" y2="270" stroke="rgba(134,189,240,.3)" stroke-width="2"/><line x1="480" y1="20" x2="480" y2="520" stroke="rgba(134,189,240,.3)" stroke-width="2"/>' +
    '<path d="M480 270 L480 30 A240 240 0 0 1 687.8 150 Z" fill="url(#sw)"/>' +
    '<path d="M600 90 L680 90 L680 60" fill="none" stroke="rgba(134,189,240,.5)" stroke-width="3"/><path d="M300 440 L560 440 L560 520" fill="none" stroke="rgba(134,189,240,.5)" stroke-width="3" stroke-dasharray="10 8"/>' +
    dots + '<circle cx="480" cy="270" r="22" fill="#ff7a52"/><circle cx="480" cy="270" r="40" fill="none" stroke="#ff7a52" stroke-width="3"/></svg>';
}

/* A plan-view site: property line, an existing building, four battery units
   behind a fence, a transformer and (variant 'lane') a fire access lane.
   flag: the unit number to mark, with flagText as the callout. Generic and
   illustrative: no dimensions, no rule values. */
function sitePlan(variant, flag, flagText) {
  var ink = '#c4d6e1', unit = '#86bdf0', hot = '#ff5a4f';
  var units = variant === 'lane'
    ? [[330, 160], [470, 160], [690, 244], [470, 300]]
    : [[292, 170], [520, 170], [520, 300], [690, 300]];
  var lane = variant === 'lane'
    ? '<rect x="670" y="32" width="150" height="386" fill="rgba(255,122,82,.10)" stroke="#ff7a52" stroke-width="2" stroke-dasharray="14 10"/><text transform="translate(752 236) rotate(-90)" font-family="Plex,monospace" font-size="17" fill="#ff7a52" letter-spacing="2">FIRE ACCESS LANE</text>'
    : '';
  var u = units.map(function (p, i) {
    var n = i + 1, f = flag === n;
    return '<rect x="' + p[0] + '" y="' + p[1] + '" width="112" height="56" fill="rgba(134,189,240,.16)" stroke="' + (f ? hot : unit) + '" stroke-width="' + (f ? 7 : 3) + '"/>' +
      '<text x="' + (p[0] + 56) + '" y="' + (p[1] + 39) + '" text-anchor="middle" font-family="Plex,monospace" font-weight="500" font-size="30" fill="#fff">' + n + '</text>';
  }).join('');
  var call = '';
  if (flag) {
    var p = units[flag - 1];
    call = '<circle cx="' + (p[0] + 56) + '" cy="' + (p[1] + 28) + '" r="78" fill="none" stroke="' + hot + '" stroke-width="4" stroke-dasharray="8 8"/>' +
      '<rect x="40" y="436" width="880" height="64" fill="' + hot + '"/><text x="480" y="478" text-anchor="middle" font-family="Inter,sans-serif" font-weight="600" font-size="30" fill="#0b2733">' + esc(flagText || '') + '</text>';
  }
  return '<svg viewBox="0 0 960 520" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="hatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="16" stroke="rgba(196,214,225,.45)" stroke-width="3"/></pattern></defs>' +
    '<rect x="40" y="30" width="880" height="390" fill="none" stroke="' + ink + '" stroke-width="3" stroke-dasharray="26 10 6 10"/>' +
    '<text x="56" y="62" font-family="Plex,monospace" font-size="19" fill="#9fb6c3" letter-spacing="2">PROPERTY LINE</text>' +
    '<rect x="70" y="110" width="210" height="270" fill="url(#hatch)" stroke="' + ink + '" stroke-width="3"/>' +
    '<text x="175" y="252" text-anchor="middle" font-family="Plex,monospace" font-size="20" fill="#e9f0f4" letter-spacing="2">BUILDING</text>' +
    lane +
    '<rect x="286" y="140" width="' + (variant === 'lane' ? 364 : 544) + '" height="250" fill="none" stroke="rgba(233,240,244,.55)" stroke-width="2" stroke-dasharray="4 8"/>' +
    '<text x="' + (variant === 'lane' ? 580 : 760) + '" y="134" font-family="Plex,monospace" font-size="18" fill="#9fb6c3" letter-spacing="2">FENCE</text>' +
    u + '<rect x="360" y="330" width="60" height="50" fill="none" stroke="' + ink + '" stroke-width="3"/><text x="390" y="362" text-anchor="middle" font-family="Plex,monospace" font-size="16" fill="' + ink + '">XFMR</text>' +
    '<g transform="translate(880 80)"><path d="M0 -30 L12 10 L0 2 L-12 10 Z" fill="' + ink + '"/><text x="0" y="36" text-anchor="middle" font-family="Plex,monospace" font-size="18" fill="' + ink + '">N</text></g>' +
    call + '</svg>';
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
