#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The editor's chrome in light and dark: an offline fixture of the real
 * editor.html styles and panel markup (as the packaging renders build it),
 * opened once per colour scheme. For the File menu, the left panel, the right
 * panel, the guided build modal and the export modal it asserts that the
 * panel's computed background is light (luminance > 0.8) under
 * prefers-color-scheme: light and dark under dark, and that the text on it
 * reads at 4.5:1 or better. Then the editor's own boot on a LIGHT operating
 * system (2026-09-27): with nothing chosen the <head> script pins dark before
 * any stylesheet and Settings > Appearance marks Dark; Light, Auto and Dark
 * picked there take effect and survive a reload; and Editor Lite, which
 * frames the editor as its engine, dresses it light even on a dark OS without
 * writing the editor's own choice. Screenshots land in
 * docs/screenshots/editor-theme.
 * No Maps, no Firebase, no /api/: nothing here is a functional acceptance run.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
var ROOT = path.join(__dirname, '..'), source = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium;
var output = process.env.EDITOR_THEME_SHOTS || path.join(ROOT, 'docs/screenshots/editor-theme');
fs.mkdirSync(output, { recursive: true });
var markup = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
function div(id) {
  var start = markup.indexOf('id="' + id + '"'); assert(start >= 0, id); start = markup.lastIndexOf('<', start);
  var tags = /<div\b[^>]*>|<\/div>/g, depth = 0, m; tags.lastIndex = start;
  while ((m = tags.exec(markup))) { depth += /^<\/div/.test(m[0]) ? -1 : 1; if (!depth) return markup.slice(start, tags.lastIndex); }
  throw new Error('Unclosed ' + id);
}
/* the real stylesheets, in page order; the theme switch's own script so OmegaUI.theme() is exercised */
var styles = (markup.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n');
var fixture = '<!doctype html><html><head><meta charset="utf-8"><title>Editor chrome</title>' + styles + '</head><body>' +
  div('tb') + div('ribbon') + div('lp') + div('rp') + div('bess-modal') + div('export-modal') +
  '<script>window.OmegaUI={};</script>' +
  '</body></html>';
/* the editor's own boot, in page order: the <head> pin, a probe of what it
   pinned before any stylesheet was parsed, the styles, the ribbon with
   Settings > Appearance, the real switch as OmegaUI.theme, the buttons' script */
function inline(id) {
  var a = source.indexOf('<script id="' + id + '">'); assert(a >= 0, id);
  return source.slice(a, source.indexOf('</script>', a) + '</script>'.length);
}
var setTheme = /\n  function setTheme\(name\) \{[\s\S]*?\n  \}\n/.exec(source); assert(setTheme, 'setTheme');
var bootFixture = '<!doctype html><html><head><meta charset="utf-8"><title>Editor boot</title>' + inline('omega-theme-boot') +
  '<script>window.__pinnedAtHead = document.documentElement.getAttribute("data-omega-theme");</script>' + styles + '</head><body>' +
  div('tb') + div('ribbon') + '<script>' + setTheme[0] + 'window.OmegaUI = { theme: setTheme };</script>' + inline('omega-theme-pick') +
  '</body></html>';
/* Editor Lite frames the editor as its engine and dresses it in the shell's
   light chrome: its real engineStyle(), run on that same boot in a frame */
var liteSource = fs.readFileSync(path.join(ROOT, 'editor-lite-logic.js'), 'utf8');
var engineStyle = /\n  function engineStyle\(doc\) \{[\s\S]*?\n  \}\n/.exec(liteSource); assert(engineStyle, 'engineStyle');
var liteHost = '<!doctype html><html><head><meta charset="utf-8"><title>Editor Lite host</title></head><body style="margin:0">' +
  '<script>var customer = false;' + engineStyle[0] +
  'var f = document.createElement("iframe"); f.id = "engine"; f.style.cssText = "border:0;width:1280px;height:700px";' +
  'f.onload = function () { engineStyle(f.contentWindow.document); window.__styled = true; }; f.src = "/__boot"; document.body.appendChild(f);</script>' +
  '</body></html>';
var server = http.createServer(function (req, res) {
  var route = req.url.split('?')[0];
  if (route === '/__theme') { res.setHeader('Content-Type', 'text/html'); return res.end(fixture); }
  if (route === '/__boot') { res.setHeader('Content-Type', 'text/html'); return res.end(bootFixture); }
  if (route === '/__lite') { res.setHeader('Content-Type', 'text/html'); return res.end(liteHost); }
  res.writeHead(404); res.end();
});
/* WCAG relative luminance and contrast, from a computed rgb()/rgba() string */
var COLOUR = function () {
  function parse(c) { var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c || ''); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null; }
  function lin(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function lum(c) { return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b); }
  function over(top, under) { var a = top.a; return { r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 }; }
  /* the ground a node sits on: its own background, else the first ancestor's, composited */
  function ground(el) {
    var layers = [], n = el;
    while (n && n.nodeType === 1) { var c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) layers.unshift(c); if (c && c.a >= 1) break; n = n.parentElement; }
    var base = { r: 255, g: 255, b: 255, a: 1 };
    layers.forEach(function (l) { base = over(l, base); });
    return base;
  }
  function contrast(a, b) { var l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
  return { parse: parse, lum: lum, ground: ground, contrast: contrast, over: over };
};
var count = 0;
function ok(v, label) { assert(v, label); count++; }
var PANELS = [
  /* the ribbon itself (2026-09-27): in light it sits on the grey ground with each button's label in ink */
  { name: 'ribbon', panel: '#ribbon', open: function () {}, text: '#ribbon .ribbon-page.active .rb-lbl, #ribbon .ribbon-page.active .rpanel-cap, #ribbon .ribbon-page.active .rsbtn' },
  { name: 'file-menu', panel: '#app-menu', open: function () { var m = document.getElementById('app-menu'); m.classList.add('open'); m.style.display = 'block'; }, text: '#app-menu .menu-item' },
  { name: 'left-panel', panel: '#lp', open: function () { var p = document.getElementById('lp'); p.classList.add('lp-open'); p.style.transition = 'none'; p.style.display = 'flex'; p.style.transform = 'none'; p.style.opacity = '1'; }, text: '#lp .sec-h, #lp label, #lp .lbl, #lp h3, #lp div' },
  { name: 'right-panel', panel: '#rp', open: function () { var p = document.getElementById('rp'); p.classList.add('rp-open'); p.style.transition = 'none'; p.style.display = 'flex'; p.style.transform = 'none'; p.style.opacity = '1'; }, text: '#rp .sec-h, #rp label, #rp h3, #rp div' },
  { name: 'guided-build', panel: '#bess-modal .modal', open: function () { var m = document.getElementById('bess-modal'); m.classList.add('on'); m.style.display = 'flex'; }, text: '#bm-title, #bess-modal label, #bess-modal div' },
  { name: 'export-modal', panel: '#export-modal > div', open: function () { var m = document.getElementById('export-modal'); m.style.display = 'flex'; }, text: '#export-modal div' }
];
async function run() {
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + server.address().port, browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  try {
    for (var scheme of ['light', 'dark']) {
      var context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
      var page = await context.newPage(), errors = [];
      page.on('pageerror', function (e) { errors.push(e.message); });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(base + '/__theme');
      await page.evaluate(function (src) { window.C = (new Function('return (' + src + ')()'))(); }, COLOUR.toString());
      /* the token set answers the scheme */
      var panelBg = await page.evaluate(function () { return getComputedStyle(document.documentElement).getPropertyValue('--panel').trim(); });
      ok(scheme === 'light' ? /^#FFFFFF$/i.test(panelBg) : /^#25282B$/i.test(panelBg), scheme + ': --panel is ' + panelBg);
      /* the title bar stays white in light while the ground under it is grey; a ribbon button has a face */
      var top = await page.evaluate(function () { var tb = getComputedStyle(document.getElementById('tb')).backgroundColor, bg = getComputedStyle(document.body).backgroundColor, rb = document.querySelector('#ribbon .ribbon-page.active .rbtn'); return { tb: tb, body: bg, face: rb ? getComputedStyle(rb).backgroundColor : '' }; });
      ok(scheme === 'light' ? (top.tb === 'rgb(255, 255, 255)' && top.body === 'rgb(233, 236, 239)' && top.face !== 'rgba(0, 0, 0, 0)') : (top.body === 'rgb(44, 47, 51)'), scheme + ': title bar ' + top.tb + ', ground ' + top.body + ', button face ' + top.face);
      for (var p of PANELS) {
        await page.evaluate(function (fn) { (new Function('return (' + fn + ')'))()(); }, p.open.toString());
        var r = await page.evaluate(function (spec) {
          var el = document.querySelector(spec.panel); if (!el) return { missing: spec.panel };
          var g = C.ground(el), lum = C.lum(g);
          /* every visible text node inside: its colour against the ground it sits on */
          var worst = 99, worstText = '', seen = 0, samples = [], low = {};
          document.querySelectorAll(spec.text).forEach(function (t) {
            if (!(t.offsetWidth || t.offsetHeight)) return;
            var own = Array.prototype.some.call(t.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim().length > 2; });
            if (!own) return;
            var cs = getComputedStyle(t); if (cs.visibility === 'hidden' || +cs.opacity < 0.5) return;
            var fg = C.parse(cs.color); if (!fg || fg.a === 0) return;
            var bg = C.ground(t); var c = C.contrast(C.over(fg, bg), bg); seen++;
            if (c < worst) { worst = c; worstText = t.textContent.trim().slice(0, 40) + ' ' + cs.color + ' on rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')'; }
            if (c < 4.5) low[cs.color] = (low[cs.color] || '') + ' | ' + t.textContent.trim().slice(0, 24);
            if (samples.length < 3) samples.push(Math.round(c * 10) / 10);
          });
          return { lum: lum, ground: 'rgb(' + Math.round(g.r) + ',' + Math.round(g.g) + ',' + Math.round(g.b) + ')', worst: worst, worstText: worstText, seen: seen, low: low };
        }, { panel: p.panel, text: p.text });
        ok(!r.missing, p.name + ' is in the fixture');
        ok(scheme === 'light' ? r.lum > 0.8 : r.lum < 0.2, scheme + ' ' + p.name + ': ground ' + r.ground + ' luminance ' + r.lum.toFixed(3));
        ok(r.seen > 0, scheme + ' ' + p.name + ': text was measured (' + r.seen + ' nodes)');
        if (process.env.EDITOR_THEME_REPORT) { Object.keys(r.low).forEach(function (k) { console.log('  low ' + scheme + ' ' + p.name + ': ' + k + r.low[k].slice(0, 120)); }); }
        else ok(r.worst >= 4.5, scheme + ' ' + p.name + ': text contrast ' + r.worst.toFixed(2) + ':1 — ' + r.worstText);
        await page.waitForTimeout(350);
        await page.screenshot({ path: path.join(output, scheme + '-' + p.name + '.png') });
        await page.evaluate(function (spec) { var el = document.querySelector(spec); var root = el.closest('.modal-bg') || el.closest('#export-modal') || el; root.style.display = 'none'; }, p.panel);
      }
      /* the switch: pin the other scheme on this OS setting and the tokens follow */
      var pinned = await page.evaluate(function (other) {
        document.documentElement.setAttribute('data-omega-theme', other);
        var v = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim();
        document.documentElement.removeAttribute('data-omega-theme'); return v;
      }, scheme === 'light' ? 'dark' : 'light');
      ok(scheme === 'light' ? /^#25282B$/i.test(pinned) : /^#FFFFFF$/i.test(pinned), scheme + ': data-omega-theme overrides the OS (' + pinned + ')');
      ok(errors.length === 0, 'browser errors: ' + errors.join('; '));
      await context.close();
    }
    /* dark by default: a LIGHT operating system and the editor's own boot */
    var bootContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
    var boot = await bootContext.newPage(), bootErrors = [];
    boot.on('pageerror', function (e) { bootErrors.push(e.message); });
    await boot.emulateMedia({ colorScheme: 'light' });
    var state = function () {
      return boot.evaluate(function () {
        var h = document.documentElement, on = document.querySelectorAll('[data-theme-pick].on');
        return { attr: h.getAttribute('data-omega-theme'), head: window.__pinnedAtHead, panel: getComputedStyle(h).getPropertyValue('--panel').trim(),
          body: getComputedStyle(document.body).backgroundColor, tb: getComputedStyle(document.getElementById('tb')).backgroundColor,
          marks: Array.prototype.map.call(on, function (b) { return b.getAttribute('data-theme-pick'); }).join(','), stored: localStorage.getItem('omega.ui.theme') };
      });
    };
    var settings = function () {
      return boot.evaluate(function () { document.querySelectorAll('#ribbon .ribbon-page, #tb .rtab').forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-page') === 'settings'); }); });
    };
    await boot.goto(base + '/__boot');
    var s = await state();
    ok(s.stored === null && s.head === 'dark' && s.attr === 'dark', 'light OS, nothing chosen: dark is pinned in <head>, before any stylesheet (' + s.stored + ', ' + s.head + ', ' + s.attr + ')');
    ok(/^#25282B$/i.test(s.panel) && s.body === 'rgb(44, 47, 51)' && s.tb === 'rgb(31, 33, 36)', 'light OS, nothing chosen: the chrome is graphite (--panel ' + s.panel + ', ground ' + s.body + ', title bar ' + s.tb + ')');
    ok(s.marks === 'dark', 'light OS, nothing chosen: Settings > Appearance marks Dark (' + s.marks + ')');
    await settings();
    await boot.waitForTimeout(350);
    await boot.screenshot({ path: path.join(output, 'default-light-os-settings.png'), clip: { x: 0, y: 0, width: 1440, height: 140 } });
    /* each choice takes effect at once and survives a reload (pinned again in <head>) */
    for (var pick of [{ name: 'light', attr: 'light', panel: /^#FFFFFF$/i }, { name: 'auto', attr: null, panel: /^#FFFFFF$/i }, { name: 'dark', attr: 'dark', panel: /^#25282B$/i }]) {
      await settings();
      await boot.click('#ribbon [data-theme-pick="' + pick.name + '"]');
      s = await state();
      ok(s.attr === pick.attr && pick.panel.test(s.panel) && s.marks === pick.name && s.stored === pick.name, 'light OS, ' + pick.name + ' picked: ' + JSON.stringify(s));
      await boot.reload();
      s = await state();
      ok(s.head === pick.attr && s.attr === pick.attr && pick.panel.test(s.panel) && s.marks === pick.name, 'light OS, ' + pick.name + ' after a reload: ' + JSON.stringify(s));
    }
    ok(bootErrors.length === 0, 'boot browser errors: ' + bootErrors.join('; '));
    await bootContext.close();
    /* Editor Lite: its engine is light even on a DARK OS with nothing chosen, and the shared choice stays unwritten */
    var liteContext = await browser.newContext({ viewport: { width: 1280, height: 700 }, colorScheme: 'dark' });
    var lite = await liteContext.newPage(), liteErrors = [];
    lite.on('pageerror', function (e) { liteErrors.push(e.message); });
    await lite.emulateMedia({ colorScheme: 'dark' });
    await lite.goto(base + '/__lite');
    await lite.waitForFunction(function () { return window.__styled === true; });
    var l = await lite.evaluate(function () {
      var w = document.getElementById('engine').contentWindow, h = w.document.documentElement;
      return { head: w.__pinnedAtHead, attr: h.getAttribute('data-omega-theme'), panel: w.getComputedStyle(h).getPropertyValue('--panel').trim(), stored: w.localStorage.getItem('omega.ui.theme') };
    });
    ok(l.head === 'dark' && l.attr === 'light' && /^#FFFFFF$/i.test(l.panel), 'Editor Lite on a dark OS: the engine boots dark, then wears the shell\'s light chrome (' + JSON.stringify(l) + ')');
    ok(l.stored === null, 'Editor Lite never writes the editor\'s own choice (' + l.stored + ')');
    ok(liteErrors.length === 0, 'Editor Lite browser errors: ' + liteErrors.join('; '));
    await liteContext.close();
    console.log('Editor chrome theme: ' + count + ' checks passed; ' + (PANELS.length * 2 + 1) + ' screenshots in ' + path.relative(ROOT, output) + '; offline fixture, no live writes.');
  } finally { await browser.close(); server.close(); }
}
run().catch(function (e) { console.error(e); server.close(); process.exitCode = 1; });
