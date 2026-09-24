/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/guides/build.js — renders each guide (plant, office, customer) to
   guides/Omega-Logic-<App>-App.pdf, plus the three back to back as
   guides/Omega-Logic-Phone-Apps.pdf: Letter, the navy ClearSky band with the
   OMEGA mark on every page (header.html), Liberation Sans. Screenshots come
   from the sandboxes (shots/). Run: node scripts/guides/build.js */
'use strict';
var fs = require('fs'), path = require('path');
var PW = (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })(), chromium = require(PW).chromium;
var CHROME = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : chromium.executablePath();
var OUT = path.join(__dirname, '..', '..', 'guides'), header = fs.readFileSync(path.join(__dirname, 'header.html'), 'utf8');
var GUIDES = { plant: 'Omega-Logic-Plant-App.pdf', office: 'Omega-Logic-Office-App.pdf', customer: 'Omega-Logic-Customer-App.pdf', all: 'Omega-Logic-Phone-Apps.pdf' };
/* the one-document version is the three guides back to back (same stylesheet),
   so it can never say something the three do not */
function combined() {
  var parts = ['office', 'plant', 'customer'].map(function (k) { return fs.readFileSync(path.join(__dirname, k + '.html'), 'utf8'); });
  var head = parts[0].slice(0, parts[0].indexOf('<body>')).replace(/<title>[^<]*<\/title>/, '<title>Omega Logic · The apps</title>');
  var bodies = parts.map(function (h, i) { var b = h.slice(h.indexOf('<body>') + 6, h.lastIndexOf('</body>')); return i ? '<div class="break"></div>' + b : b; });
  return head + '<body>' + bodies.join('\n') + '</body></html>';
}
var TITLES = { plant: ['Omega Logic · The Plant app', 'For the builders: work orders, the bench, every unit. Install it, run the work, one system. ClearSky-OMEGA'],
  office: ['Omega Logic · The app', 'For the office: what needs a person, orders, POs, customers, stock, sites. One system. ClearSky-OMEGA'],
  customer: ['Omega Logic · Your account on your phone', 'For the customer: site plans, orders and warranty, purchase orders, sites & equipment. ClearSky-OMEGA'],
  all: ['Omega Logic on your phone', 'The Omega Logic app, the Plant app and the customer app. Install them, run the work, one system. ClearSky-OMEGA'] };
function headerFor(key) { return header.replace('Omega Logic on your phone', TITLES[key][0]).replace('Three apps: the plant, the office, the customer. Install them, run the work, one system. ClearSky-OMEGA', TITLES[key][1]); }
(async function () {
  fs.mkdirSync(OUT, { recursive: true });
  var b = await chromium.launch({ executablePath: CHROME });
  for (var key in GUIDES) {
    var p = await b.newPage();
    if (key === 'all') { var tmp = path.join(__dirname, '.all.html'); fs.writeFileSync(tmp, combined()); await p.goto('file://' + tmp, { waitUntil: 'load' }); fs.unlinkSync(tmp); }
    else await p.goto('file://' + path.join(__dirname, key + '.html'), { waitUntil: 'load' });
    await p.waitForTimeout(300);
    await p.pdf({ path: path.join(OUT, GUIDES[key]), format: 'Letter', printBackground: true, displayHeaderFooter: true, headerTemplate: headerFor(key),
      footerTemplate: '<div style="width:100%;text-align:center;font:8pt Liberation Sans,Arial,sans-serif;color:#5a7280;padding-bottom:6px">ClearSky Energy Solutions &nbsp;·&nbsp; silmarillion.clearskyomega.com &nbsp;·&nbsp; page <span class="pageNumber"></span></div>',
      margin: { top: '1.05in', bottom: '0.6in', left: '0.55in', right: '0.55in' } });
    console.log(GUIDES[key]); await p.close();
  }
  await b.close();
})().catch(function (e) { console.error(e); process.exit(1); });
