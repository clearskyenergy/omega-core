/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/guides/build.js — renders each guide (office, plant, customer) to
   guides/Omega-Logic-<App>-App.pdf, plus the three back to back as
   guides/Omega-Logic-Phone-Apps.pdf: Letter, the navy ClearSky band with the
   Omega Logic mark on every page (header.html), Liberation Sans. The office
   guide is the Omega Logic app guide and is also written as
   guides/Omega-Logic-App.pdf. Screenshots come from the sandboxes (shots/),
   the QR codes from make-qr.js (qr/).

     node scripts/guides/build.js           every picture must be there, and
                                            every screenshot must be one
                                            shots.js took and checked
                                            (shots/manifest.json, guard.js)
     node scripts/guides/build.js --draft   a missing or unchecked screenshot
                                            is drawn as a dashed box with its
                                            file name; written to a temp folder
     ... --out DIR                          write somewhere other than guides/

   A draft NEVER lands in guides/, which the site serves: without --out it
   goes to <tmp>/omega-guides-draft, and --draft --out guides/ is refused.

   Every build refuses a guide whose printed text names a tenant (guard.js
   LEAK): /guides is public and goes to every subscriber.

   A guide laid out as fixed sheets (office.html: <main data-mode="solo">)
   draws its own band and footer and is printed edge to edge; build.js
   refuses a sheet whose content runs past its page. */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), Guard = require('./guard');
var PW = (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })(), chromium = require(PW).chromium;
var CHROME = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : chromium.executablePath();
var DRAFT = process.argv.indexOf('--draft') >= 0;
var SERVED = path.resolve(__dirname, '..', '..', 'guides'), SHOTS = path.join(__dirname, 'shots');
var oi = process.argv.indexOf('--out');
var OUT = oi > 0 && process.argv[oi + 1] ? path.resolve(process.argv[oi + 1]) : (DRAFT ? path.join(os.tmpdir(), 'omega-guides-draft') : SERVED);
if (DRAFT && OUT === SERVED) { console.error('guides: a --draft never writes to guides/ (the site serves it); pass --out DIR'); process.exit(1); }
/* the band's mark is the app icon itself, read at build time (a header
   template cannot load a file, so it goes in as a data URI) */
var MARK = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', '..', 'icons', 'omega-logic-180.png')).toString('base64');
var header = fs.readFileSync(path.join(__dirname, 'header.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace('%%OMEGA_LOGIC_MARK%%', MARK);
var GUIDES = { plant: 'Omega-Logic-Plant-App.pdf', office: 'Omega-Logic-Office-App.pdf', customer: 'Omega-Logic-Customer-App.pdf', all: 'Omega-Logic-Phone-Apps.pdf' };
/* the same PDF under a second name: the Omega Logic app guide is what the
   office guide is; the old name stays because the app's Help panel, the kit
   and the tests link it */
var ALSO = { office: ['Omega-Logic-App.pdf'] };
function read(k) { return fs.readFileSync(path.join(__dirname, k + '.html'), 'utf8'); }
function headOf(h) { return h.slice(0, h.indexOf('<body>')); }
function bodyOf(h) { return h.slice(h.indexOf('<body>') + 6, h.lastIndexOf('</body>')); }
/* the one-document version is the three guides back to back, so it can never
   say something the three do not. The plant and customer guides share one
   stylesheet; the office guide's is scoped under .olg and joins it, and its
   sheets switch to "book" mode: one page's content box each, under the band
   Chromium draws. */
function combined() {
  var office = read('office'), styles = headOf(office).match(/<style>[\s\S]*?<\/style>/g) || [];
  var head = headOf(read('plant')).replace(/<title>[^<]*<\/title>/, '<title>Omega Logic · The apps</title>').replace('</head>', styles.join('\n') + '</head>');
  var bodies = [bodyOf(office).replace('data-mode="solo"', 'data-mode="book"'), bodyOf(read('plant')), bodyOf(read('customer'))];
  return head + '<body>' + bodies.map(function (b, i) { return i ? '<div class="break"></div>' + b : b; }).join('\n') + '</body></html>';
}
var TITLES = { plant: ['Omega Logic · The Plant app', 'For the builders: work orders, the bench, every unit. Install it, run the work, one system. ClearSky-OMEGA'],
  office: ['Omega Logic · The app', 'Put it on your phone or computer, sign in, and run the business from it. ClearSky-OMEGA'],
  customer: ['Your account on your phone', 'Your company account with your supplier: site plans, orders and warranty, purchase orders, sites & equipment, your people.'],
  all: ['Omega Logic on your phone', 'The Omega Logic app, the Plant app and the customer app. Install them, run the work, one system. ClearSky-OMEGA'] };
/* The CUSTOMER guide goes to every supplier's customers, and their app wears
   the supplier's name, not ours: a plain band, no Omega Logic mark, no
   ClearSky footer (whether our name appears is the supplier's contract, which
   a static PDF cannot know). The office, plant and combined guides are
   ClearSky's and keep the band. */
var PLAIN = '<div style="width:100%;margin:0 0.55in;padding:0 0 6px;border-bottom:2px solid #0f2e3f;font:700 13pt Liberation Sans,Arial,sans-serif;color:#0f2e3f">TITLE<div style="font:400 8.5pt Liberation Sans,Arial,sans-serif;color:#5a7280;margin-top:2px">SUB</div></div>';
function headerFor(key) { if (key === 'customer') return PLAIN.replace('TITLE', TITLES[key][0]).replace('SUB', TITLES[key][1]); return header.replace('Omega Logic on your phone', TITLES[key][0]).replace('Three apps: the plant, the office, the customer. Install them, run the work, one system. ClearSky-OMEGA', TITLES[key][1]); }
function footerFor(key) { return '<div style="width:100%;text-align:center;font:8pt Liberation Sans,Arial,sans-serif;color:#5a7280;padding-bottom:6px">' + (key === 'customer' ? '' : 'ClearSky Energy Solutions &nbsp;·&nbsp; silmarillion.clearskyomega.com &nbsp;·&nbsp; ') + 'page <span class="pageNumber"></span></div>'; }
function sourceOf(key) { return key === 'all' ? combined() : read(key); }
/* every local picture a guide points at: a missing screenshot is a draft
   (--draft draws its box), anything else missing is a broken build */
function assets(html) {
  var seen = {}, out = [], re = /\ssrc="([^"]+)"/g, m;
  while ((m = re.exec(html))) { var src = m[1]; if (/^(data:|https?:|#)/.test(src) || seen[src]) continue; seen[src] = 1; out.push(src); }
  return out;
}
/* A screenshot is printed only if shots.js took it and its bytes match the
   record (guard.js): 'missing', 'unrecorded' (a leftover or a hand-copied
   picture) and 'changed' are all unusable, and all name the fix. */
var MANIFEST = Guard.readManifest(SHOTS);
function shotState(src) { return Guard.verdict(SHOTS, src.replace(/^shots\//, ''), MANIFEST); }
function unusableOf(html) { return assets(html).filter(function (src) { return /^shots\//.test(src) && shotState(src) !== 'ok'; }); }
var problems = [], badShots = {};
Object.keys(GUIDES).forEach(function (key) {
  assets(sourceOf(key)).forEach(function (src) {
    if (/^shots\//.test(src)) { var st = shotState(src); if (st !== 'ok') (badShots[src] = badShots[src] || { state: st, in: [] }).in.push(key); }
    else if (!fs.existsSync(path.join(__dirname, src))) problems.push(key + ': ' + src + ' does not exist');
  });
});
if (problems.length) { console.error('guides: broken references\n  ' + problems.join('\n  ')); process.exit(1); }
var WHY = { missing: 'missing', unrecorded: 'not taken by shots.js (a leftover or hand-copied picture)', changed: 'changed since shots.js took it' };
if (Object.keys(badShots).length && !DRAFT) {
  console.error('guides: screenshots that cannot be printed:\n  '
    + Object.keys(badShots).map(function (s) { return s + '  ' + WHY[badShots[s].state] + '  (' + badShots[s].in.join(', ') + ')'; }).join('\n  ')
    + '\nTake every shot again, from this tree:  node scripts/guides/shots.js\n(or just these:  node scripts/guides/shots.js --only ' + Object.keys(badShots).map(function (s) { return s.replace(/^shots\/|\.png$/g, ''); }).join(',')
    + ')\nor build with --draft --out DIR to see the layout with a box in their place.');
  process.exit(1);
}
(async function () {
  fs.mkdirSync(OUT, { recursive: true });
  var b = await chromium.launch({ executablePath: CHROME });
  for (var key in GUIDES) {
    var p = await b.newPage(), html = sourceOf(key), missing = unusableOf(html);
    var tmp = path.join(__dirname, '.' + key + '.build.html');
    fs.writeFileSync(tmp, html);
    try { await p.goto('file://' + tmp, { waitUntil: 'load' }); } finally { fs.unlinkSync(tmp); }
    await p.emulateMedia({ media: 'print' });
    if (missing.length) {
      /* a neutral dashed box the size the screenshot will be, named */
      await p.evaluate(function (list) {
        Array.prototype.slice.call(document.images).forEach(function (img) {
          if (list.srcs.indexOf(img.getAttribute('src')) < 0) return;
          var w = +img.getAttribute('width') || 780, h = +img.getAttribute('height') || 1560, d = document.createElement('div');
          d.className = 'shot-missing';
          d.style.cssText = 'display:flex;align-items:center;justify-content:center;text-align:center;width:100%;aspect-ratio:' + w + '/' + h + ';border:1.5px dashed #9fb3bd;border-radius:8px;background:#f4f7f8;color:#5a7280;font:8pt "Liberation Mono","DejaVu Sans Mono",monospace;padding:6px;overflow-wrap:anywhere';
          d.textContent = img.getAttribute('src') + (list.why[img.getAttribute('src')] === 'missing' ? '' : ' (retake with shots.js)');
          img.parentNode.replaceChild(d, img);
        });
      }, { srcs: missing, why: missing.reduce(function (o, src) { o[src] = shotState(src); return o; }, {}) });
    }
    await p.waitForTimeout(300);
    /* the printed words, not the source: a tenant's name never ships */
    var leak = await p.evaluate(function (src) { var m = (document.title + '\n' + document.body.innerText).match(new RegExp(src, 'i')); return m ? m[0] : null; }, Guard.LEAK.source);
    if (leak) { await b.close(); console.error('guides: ' + GUIDES[key] + ' names a tenant ("' + leak + '"): /guides is public. Say "your company" instead.'); process.exit(1); }
    var sheets = await p.evaluate(function () { return !!document.querySelector('main[data-mode="solo"] .sheet'); });
    var over = await p.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll('.olg .sheet'), function (s, i) {
        var box = s.querySelector('.body') || s, extra = box.scrollHeight - box.clientHeight;
        return extra > 1 ? 'sheet ' + (i + 1) + ' runs ' + extra + 'px past its page' : '';
      }).filter(Boolean);
    });
    if (over.length) { await b.close(); console.error('guides: ' + GUIDES[key] + ': ' + over.join('; ')); process.exit(1); }
    var file = path.join(OUT, GUIDES[key]);
    if (sheets) await p.pdf({ path: file, format: 'Letter', printBackground: true, displayHeaderFooter: false, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
    else await p.pdf({ path: file, format: 'Letter', printBackground: true, displayHeaderFooter: true, headerTemplate: headerFor(key),
      footerTemplate: footerFor(key),
      margin: { top: '1.05in', bottom: '0.6in', left: '0.55in', right: '0.55in' } });
    console.log(GUIDES[key] + (missing.length ? '  (draft: ' + missing.length + ' screenshot' + (missing.length === 1 ? '' : 's') + ' boxed)' : ''));
    (ALSO[key] || []).forEach(function (name) { fs.copyFileSync(file, path.join(OUT, name)); console.log(name + '  (= ' + GUIDES[key] + ')'); });
    await p.close();
  }
  await b.close();
  if (DRAFT) console.log('draft written to ' + OUT);
})().catch(function (e) { console.error(e); process.exit(1); });
