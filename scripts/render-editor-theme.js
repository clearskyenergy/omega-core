#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The editor's chrome in light and dark: an offline fixture of the real
 * editor.html styles and panel markup (as the packaging renders build it),
 * opened once per colour scheme. For the File menu, the left panel, the right
 * panel, the guided build modal and the export modal it asserts that the
 * panel's computed background is light (luminance > 0.8) under
 * prefers-color-scheme: light and dark under dark, and that the text on it
 * reads at 4.5:1 or better. The plan chip's panel (omega-editor-plan.js) is
 * drawn from a real read-only server projection with the server's figures.
 * Screenshots land in docs/screenshots/editor-theme.
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
/* the plan chip's own script, inline: it paints into the title bar's mount */
var plan = fs.readFileSync(path.join(ROOT, 'omega-editor-plan.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
/* the export's own pre-capture step, cut out of the file so the check runs
   what ships: every sheet export (blueprint, plot plan, proposal) calls it on
   #sc right before html2canvas */
var NORM_A = source.indexOf('async function _preCaptureNormalize(el) {'), NORM_B = source.indexOf('async function _captureCanvasWithSVG(', NORM_A);
assert(NORM_A > 0 && NORM_B > NORM_A, '_preCaptureNormalize is in editor.html');
var normalize = source.slice(NORM_A, NORM_B).replace(/<\/script/gi, '<\\/script');
var fixture = '<!doctype html><html><head><meta charset="utf-8"><title>Editor chrome</title>' + styles + '</head><body>' +
  div('portal-nav') + div('tb') + div('ribbon') + div('lp') + div('rp') + div('bess-modal') + div('export-modal') +
  '<div id="sc" style="position:absolute;left:340px;top:140px;width:760px;height:520px">' + div('lgd') + '</div>' +
  '<script>window.OmegaUI={};</script><script>' + plan + '</script><script>' + normalize + '</script>' +
  '</body></html>';
/* a read-only package with every part of the panel: the notice and its pay
   link, the server's figures, In Site Map, Elsewhere and a change waiting
   for payment. Real projection (api/_lib/package-access.js). */
var X = require('../api/_lib/package-access'), PAY = 'https://app.qbo.intuit.com/app/customer/pay/theme';
var planInput = {
  view: X.project({ emailVerified: true }, { packaged: true, packagingState: 'trial', trialStartedAt: Date.now() - 20 * 86400000, trialEndsAt: Date.now() - 6 * 86400000,
    accessUntil: Date.now() - 6 * 86400000, paymentLink: PAY, modules: ['lite', 'gridatlas', 'storage', 'whitelabel'] }, { status: 'active' }, { role: 'owner', status: 'active' }),
  figures: { planDisplay: 'Field', monthlyDisplay: '$1,480.00/month', nextInvoiceOn: '2026-10-01', amountDue: 1480, amountDueDisplay: '$1,480.00',
    pending: [{ add: ['estimate'], paymentLink: PAY }], invoices: [] }
};
var server = http.createServer(function (req, res) {
  if (req.url.split('?')[0] === '/__theme') { res.setHeader('Content-Type', 'text/html'); return res.end(fixture); }
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
  { name: 'export-modal', panel: '#export-modal > div', open: function () { var m = document.getElementById('export-modal'); m.style.display = 'flex'; }, text: '#export-modal div' },
  /* the plan chip's panel (2026-09-27): what the workspace pays for and holds */
  { name: 'plan-popover', panel: '#omega-plan-pop', open: function () { OmegaEditorPlan.show(window.__planInput); }, text: '#omega-plan-pop .oep-eyebrow, #omega-plan-pop .oep-name, #omega-plan-pop .oep-pill, #omega-plan-pop p, #omega-plan-pop b, #omega-plan-pop span, #omega-plan-pop a, #omega-plan-pop button, #omega-plan-pop h4, #omega-plan-pop i' }
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
      await page.evaluate(function (input) { window.__planInput = input; }, planInput);
      /* the token set answers the scheme */
      var panelBg = await page.evaluate(function () { return getComputedStyle(document.documentElement).getPropertyValue('--panel').trim(); });
      ok(scheme === 'light' ? /^#FFFFFF$/i.test(panelBg) : /^#25282B$/i.test(panelBg), scheme + ': --panel is ' + panelBg);
      /* the title bar stays white in light while the ground under it is grey; a ribbon button has a face */
      var top = await page.evaluate(function () { var tb = getComputedStyle(document.getElementById('tb')).backgroundColor, bg = getComputedStyle(document.body).backgroundColor, rb = document.querySelector('#ribbon .ribbon-page.active .rbtn'); return { tb: tb, body: bg, face: rb ? getComputedStyle(rb).backgroundColor : '' }; });
      ok(scheme === 'light' ? (top.tb === 'rgb(255, 255, 255)' && top.body === 'rgb(233, 236, 239)' && top.face !== 'rgba(0, 0, 0, 0)') : (top.body === 'rgb(44, 47, 51)'), scheme + ': title bar ' + top.tb + ', ground ' + top.body + ', button face ' + top.face);
      /* Equipment labels (2026-09-27, 21 Hoosac St): the name pill under every
         placed element is forced dark in both themes because it sits on
         satellite imagery, so its ink must be light in both. It was
         var(--text) — near-black in light — and read dark-on-dark on the canvas
         and on the report's site map. A long name must wrap inside the pill,
         not run out past its end, which it also did. */
      var labels = await page.evaluate(function () {
        var host = document.createElement('div');
        host.className = 'cel'; host.style.cssText = 'position:absolute;left:640px;top:420px;width:40px;height:40px';
        host.innerHTML = '<div class="eq-lbl-wrap" style="position:absolute;left:20px;top:46px;transform:translate(-50%,0)">'
          + '<div class="nd-lbl">Autel AC Elite \u00d72 \u2014 dual pedestal</div>'
          + '<div class="nd-spec">240V 1\u00d8 -- NEMA 3R -- sized per EVSE continuous load</div></div>';
        document.body.appendChild(host);
        var out = ['.nd-lbl', '.nd-spec'].map(function (sel) {
          var t = host.querySelector(sel), cs = getComputedStyle(t);
          var fg = C.parse(cs.color), bg = C.ground(t);
          var r = t.getBoundingClientRect();
          return { sel: sel, color: cs.color, contrast: C.contrast(C.over(fg, bg), bg), overflow: t.scrollWidth - t.clientWidth,
                   width: Math.round(r.width), lines: Math.round((r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / parseFloat(cs.lineHeight)) };
        });
        host.remove();
        return out;
      });
      labels.forEach(function (x) {
        ok(x.contrast >= 4.5, scheme + ': equipment label ' + x.sel + ' contrast ' + x.contrast.toFixed(2) + ':1 (' + x.color + ')');
        ok(x.overflow <= 1, scheme + ': equipment label ' + x.sel + ' keeps a long name inside its pill (overflow ' + x.overflow + 'px)');
        /* and wraps only when it has to: the pill is sized to its text, so
           this name is two lines in a full-width pill, not one word a line */
        ok(x.width >= 150 && x.lines <= 3, scheme + ': equipment label ' + x.sel + ' uses the pill width (' + x.width + 'px, ' + x.lines + ' lines)');
      });
      /* The legend on an exported sheet (2026-09-30, Concord, 164 Summer St:
         "the legend is spitting out blanks ... it gets removed once I export
         it"). _preCaptureNormalize paints the key's ground dark for the
         capture; under the light chrome its rows kept the theme's dark ink,
         so the sheet showed the icons and nothing else. Rows are built the
         way renderLegend() builds them. On screen the key follows the theme;
         during the capture every line of it reads on the dark ground; after
         the capture #lgd carries exactly the inline style it had before. */
      var key = await page.evaluate(async function () {
        document.getElementById('lgd-items').innerHTML =
          '<div style="font-size:8px;font-weight:800;letter-spacing:.8px;opacity:.6;margin:2px 0 4px">EQUIPMENT</div>'
          + '<div class="li"><div class="li-ico"><svg width="16" height="16"><rect width="16" height="16" fill="#2E7D4F"/></svg></div><span class="li-txt">EVSE 1 · Autel AC Elite ×2</span></div>'
          + '<div class="li"><div class="li-ico" style="font-size:8px;font-weight:800">MB</div><span class="li-txt">New Meter Bank</span></div>'
          + '<div style="font-size:8px;font-weight:800;letter-spacing:.8px;opacity:.6;margin:8px 0 4px">CONDUIT</div>'
          + '<div class="li"><div class="li-line" style="background:#F59E0B"></div><span class="li-txt">Branch — panel→EVSE<br><span style="font-size:8px;opacity:.65">2 runs · 64 ft of conduit · in trench</span></span></div>'
          + '<div class="li" style="border-top:1px solid var(--hairline);margin-top:4px;padding-top:4px"><span class="li-txt" style="font-size:8.5px"><strong>Trench 40 ft</strong> · dug once</span></div>';
        var lgd = document.getElementById('lgd');
        lgd.style.display = 'block';
        function measure(fold) {
          var g = C.ground(lgd), worst = 99, what = '', n = 0;
          lgd.querySelectorAll('h4, .li-txt, .li-txt span, #lgd-items > div:not(.li)').forEach(function (t) {
            var own = Array.prototype.some.call(t.childNodes, function (c) { return c.nodeType === 3 && c.textContent.trim().length > 1; });
            if (!own) return;
            var cs = getComputedStyle(t), fg = C.parse(cs.color), a = 1;
            if (fold) for (var p = t; p && p !== lgd.parentNode; p = p.parentElement) a *= +getComputedStyle(p).opacity;
            fg.a *= a; n++;
            var c = C.contrast(C.over(fg, g), g);
            if (c < worst) { worst = c; what = t.textContent.trim().slice(0, 28) + ' ' + cs.color; }
          });
          return { ground: 'rgb(' + Math.round(g.r) + ',' + Math.round(g.g) + ',' + Math.round(g.b) + ')', lum: C.lum(g), worst: worst, what: what, n: n };
        }
        var before = lgd.getAttribute('style'), screen = measure();
        var cleanup = await _preCaptureNormalize(document.getElementById('sc'));
        var capture = measure(true);   /* at export, as drawn: opacity folded in */
        cleanup();
        return { screen: screen, capture: capture, restored: lgd.getAttribute('style') === before, style: lgd.getAttribute('style'), after: measure() };
      });
      ok(key.screen.n >= 6 && key.capture.n === key.screen.n, scheme + ': legend text measured (' + key.screen.n + ' lines)');
      ok(scheme === 'light' ? key.screen.lum > 0.8 : key.screen.lum < 0.2, scheme + ': legend on screen follows the theme, ground ' + key.screen.ground);
      ok(key.screen.worst >= 4.5, scheme + ': legend on screen contrast ' + key.screen.worst.toFixed(2) + ':1 — ' + key.screen.what);
      ok(key.capture.lum < 0.2, scheme + ': legend at export sits on the dark sheet ground ' + key.capture.ground);
      ok(key.capture.worst >= 4.5, scheme + ': legend at export contrast ' + key.capture.worst.toFixed(2) + ':1 — ' + key.capture.what);
      ok(key.restored, scheme + ': the capture hands #lgd back as it was (' + key.style + ')');
      ok(Math.abs(key.after.worst - key.screen.worst) < 0.01, scheme + ': legend on screen after export reads as before (' + key.after.worst.toFixed(2) + ':1)');
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
    console.log('Editor chrome theme: ' + count + ' checks passed; ' + (PANELS.length * 2) + ' screenshots in ' + path.relative(ROOT, output) + '; offline fixture, no live writes.');
  } finally { await browser.close(); server.close(); }
}
run().catch(function (e) { console.error(e); server.close(); process.exitCode = 1; });
