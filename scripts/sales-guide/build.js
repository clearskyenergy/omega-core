/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/sales-guide/build.js — renders docs/OMEGA-Sales-Guide.pdf, the
   internal guide for the sales team, from sales-guide.html: Letter, the navy
   ClearSky band with the CLEARSKY-OMEGA lockup on every page, the ClearSky
   logo on the cover, Liberation Sans.

     node scripts/sales-guide/build.js               → docs/OMEGA-Sales-Guide.pdf
     ... --out DIR                                    write the PDF somewhere else
     ... --shots DIR                                  also a PNG of every page, to look at
     ... --draft                                      an overflowing page is reported, not
                                                      refused; written to a temp folder

   Every price, module, plan, meter, starter package and discovery question
   in the PDF is read HERE from the one catalog (api/_lib/modules.js), the
   one price book (api/_lib/pricebook.js: the repo's release version, the
   same book /api/offerings falls back to), the pricing engine
   (api/_lib/subscription-pricing.js, which quotes the worked examples) and
   the proposal's questions (api/_lib/subscription-proposal.js). The
   template carries %%TOKENS%% and no figures, so the guide cannot say a
   price the platform does not. The only words typed here are the "replaces"
   column (typical market figures from docs/VALUE-LADDER-PACKAGING.md §3.3,
   labelled as such in the PDF) and the page addresses.

   The guide is internal (docs/ is not served) and is NOT one of the customer
   guides in scripts/guides/, whose freshness test covers guides/ only. A
   sheet whose content runs past its page fails the build, as there. */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.resolve(__dirname, '..', '..');
var M = require(path.join(ROOT, 'api/_lib/modules')), B = require(path.join(ROOT, 'api/_lib/pricebook'));
var P = require(path.join(ROOT, 'api/_lib/subscription-pricing')), SP = require(path.join(ROOT, 'api/_lib/subscription-proposal'));
var TOOLS = require(path.join(ROOT, 'omega-tools.js'));
var PW = (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })(), chromium = require(PW).chromium;
var CHROME = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : chromium.executablePath();
function arg(flag) { var i = process.argv.indexOf(flag); return i > 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : null; }
var DRAFT = process.argv.indexOf('--draft') >= 0;
var OUT = arg('--out') || (DRAFT ? path.join(require('os').tmpdir(), 'omega-sales-guide-draft') : path.join(ROOT, 'docs')), SHOTS = arg('--shots'), PDF = 'OMEGA-Sales-Guide.pdf';
if (DRAFT && OUT === path.join(ROOT, 'docs')) { console.error('sales-guide: a --draft never writes to docs/; pass --out DIR'); process.exit(1); }
var HOST = 'silmarillion.clearskyomega.com';
/* the support address is mail.js's one constant; mail.js needs nodemailer, so it is read, not required */
var SUPPORT = (fs.readFileSync(path.join(ROOT, 'api/_lib/mail.js'), 'utf8').match(/SUPPORT_EMAIL\s*=\s*process\.env\.SUPPORT_EMAIL\s*\|\|\s*'([^']+)'/) || [])[1];
if (!SUPPORT) { console.error('sales-guide: SUPPORT_EMAIL not found in api/_lib/mail.js'); process.exit(1); }

var book = B.proposed(), money = P.money, catalog = P.catalog(book), byKey = {};
catalog.forEach(function (m) { byKey[m.key] = m; });
/* what the customer pays for today instead: typical market figures (VALUE-LADDER §3.3), confirmed on the call, never quoted unasked */
var REPLACES = {
  lite: 'A design seat and the proposal built by hand',
  gridatlas: 'Grid and hosting-capacity data subscription, $250–$1,500/mo',
  storage: 'Storage modelling seat, $300–$1,000/mo',
  estimate: 'Estimating seat + manual RFQ time, $250–$800/mo',
  evrebates: '~$1,000 per application prepared outside',
  plansets: 'CAD seat + outsourced drafting, $400–$1,500/mo',
  siteintel: 'Site-screening consultant or GIS analyst time, $500–$2,000/mo',
  engineering: 'Power-systems analysis licence or engineer hours, $500–$1,500/mo',
  finance: 'Analyst model build + modelling tools, $500–$2,000/mo',
  compute: 'Site-selection consultant time, $500–$1,500/mo',
  ops: 'Asset-management platform, $500–$2,000/mo',
  whitelabel: 'Custom web sizing tool + lead capture, $500–$2,000/mo',
  permitting: 'A $30,000 consultant report',
  sitefinder: 'Parcel + capacity data, $1,000–$8,000/mo',
  'logic-office': 'An order desk run in email and spreadsheets',
  'logic-plant': 'Paper travellers and a whiteboard',
  'logic-materials': 'A purchasing spreadsheet and stock counts by hand',
  'logic-logistics': 'Carrier emails and a warranty binder',
  'logic-customer': 'Status calls and emailed PDFs'
};
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function short(name) { return name.replace(/^(Omega|Logic)\s+/, ''); }
function mark(m) { return '<span class="mark' + (m.shelf === 'platform' ? ' pf' : '') + '">' + esc(m.mark) + '</span>'; }
function names(keys) { return keys.map(function (k) { return byKey[k].name; }).join(', '); }
function dataUri(rel) { return 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, rel)).toString('base64'); }
function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
function list(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
function shelfPrice(shelf) {
  var prices = uniq(catalog.filter(function (m) { return m.shelf === shelf; }).map(function (m) { return m.priceCents; })).sort(function (a, b) { return a - b; });
  if (shelf === 'platform') return 'from ' + money(prices[0]) + '; all five ' + money(book.logicBundle.priceCents);
  return money(prices[0]) + (prices.length > 1 ? '–' + money(prices[prices.length - 1]) : '') + (shelf === 'floor' ? '' : ' each') + (shelf === 'deliverable' ? ' + usage' : '');
}
function shelfNames(shelf) { return catalog.filter(function (m) { return m.shelf === shelf; }).map(function (m) { return short(m.name); }).join(', '); }
var WHO = { floor: 'Everyone: design, guided builds, blueprint, proposal.', addon: 'Most installers, developers and EPCs.', standard: 'Most installers, developers and EPCs.',
  premium: 'Teams that draw, engineer, finance or operate.', deliverable: 'Volume permitting or site sourcing.', platform: 'OEMs, distributors and builders who take orders, build and ship.' };
/* the ladder graphic: five rungs (Add-on and Plus share one, they are the same price) */
var RUNGS = [['floor'], ['addon', 'standard'], ['premium'], ['deliverable'], ['platform']];
var ladder = RUNGS.map(function (shelves, i) {
  var label = shelves.map(function (s) { return M.shelfLabels()[s]; }).join(' · ');
  return '<div class="rung"><div class="r">' + (i + 1) + ' · ' + esc(label) + '</div><div class="n">' + esc(shelves.map(shelfNames).join(', ')) + '</div>'
    + '<div class="p">' + esc(shelfPrice(shelves[0])) + '</div><div class="w">' + esc(WHO[shelves[0]]) + '</div></div>';
}).join('');
/* the menu */
function menuRows(shelves) { return shelves.map(function (shelf) {
  var rows = catalog.filter(function (m) { return m.shelf === shelf; });
  return '<tr class="shelf"><td colspan="3">' + esc(M.shelfLabels()[shelf]) + (shelf === 'platform' ? ' · sold in five parts, Logic Office first' : '') + '</td><td class="price">' + esc(shelfPrice(shelf)) + '</td></tr>'
    + rows.map(function (m) {
      return '<tr><td>' + mark(m) + '<b>' + esc(m.name) + '</b>' + (m.usageDisplay ? '<br><span class="dim">' + esc(m.usageDisplay) + '</span>' : '') + '</td><td>' + esc(m.blurb) + '</td><td class="dim">' + esc(REPLACES[m.key] || '') + '</td><td class="price">' + esc(money(m.priceCents)) + '</td></tr>';
    }).join('');
}).join(''); }
var logicParts = catalog.filter(function (m) { return m.shelf === 'platform'; });
var logicAlacarte = logicParts.reduce(function (s, m) { return s + m.priceCents; }, 0);
/* plans */
function saves(p) { return money(book.modules.lite.priceCents + p.capCents - p.priceCents); }
var planRows = '<tr><td><b>' + esc(byKey.lite.name) + '</b></td><td>' + esc(byKey.lite.name) + ' alone; every module at list on top</td><td class="price">' + money(book.modules.lite.priceCents) + '</td></tr>'
  + ['field', 'pro'].map(function (k) {
    var p = book.plans[k];
    return '<tr><td><b>' + esc(p.name) + '</b></td><td>' + esc(byKey.lite.name) + ' + up to ' + money(p.capCents) + ' of modules' + (p.maxDeliverables ? ', at most ' + p.maxDeliverables + ' ' + esc(M.shelfLabels().deliverable) + ' module' : ', no ' + esc(M.shelfLabels().deliverable) + ' modules') + '; saves up to ' + saves(p) + ' a month against the same modules one by one</td><td class="price">' + money(p.priceCents) + '</td></tr>';
  }).join('')
  + '<tr><td><b>Enterprise</b></td><td>Every module, several workspaces, pooled usage and development hours, on a contract</td><td class="price">Contact for pricing</td></tr>';
var feeGroups = [];
[['lite', byKey.lite.name], ['field', book.plans.field.name], ['pro', book.plans.pro.name], ['enterprise', 'Enterprise']].forEach(function (x) {
  var amount = book.serviceFees[x[0]], g = feeGroups.filter(function (f) { return f.amount === amount; })[0];
  if (g) g.names.push(x[1]); else feeGroups.push({ amount: amount, names: [x[1]] });
});
var feeRows = list(feeGroups.map(function (g) { return list(g.names) + ' <b>' + money(g.amount) + '/year</b>'; }));
var usageRows = Object.keys(book.usage).map(function (k) {
  var u = book.usage[k];
  return '<tr><td><b>' + esc(byKey[u.module].name) + '</b><br><span class="dim">' + esc(u.name) + '</span></td><td>' + u.included + ' a cycle</td><td>' + money(u.overageCents) + ' each</td><td>' + u.packUnits + ' for ' + money(u.packCents) + '</td></tr>';
}).join('');
var logicPartsText = logicParts.map(function (m) { return m.name + ' ' + money(m.priceCents); }).join(', ');
/* the worked examples: the platform's own quote for each starter package */
var starters = M.starters(), labels = M.starterLabels();
var starterRows = Object.keys(starters).map(function (k) {
  var q = P.quote(starters[k], book), room = q.plan === 'alacarte' ? '' : ' · ' + money(book.plans[q.plan].capCents - q.editorListCents) + ' of module room left';
  return '<tr><td><b>' + esc(labels[k]) + '</b></td><td>' + esc(starters[k].filter(function (m) { return m !== 'lite'; }).map(function (m) { return short(byKey[m].name); }).join(', ')) + '</td><td class="price">' + money(q.alacarteCents) + '</td><td class="price">' + money(q.recurringCents) + '</td><td class="dim">' + esc(q.display.plan + room) + '</td></tr>';
}).join('');
/* discovery: the twelve questions, with the follow-up tiles some carry */
var questionRows = SP.QUESTIONS.map(function (q) {
  var more = (q.more || []).map(function (m) { return esc(m.text) + ': ' + esc(names(m.adds)); }).join('; ');
  return '<tr><td class="dim">' + q.n + '</td><td><b>' + esc(q.short) + '</b><br><span class="dim">' + esc(q.hint) + '</span></td><td>' + esc(q.text) + (q.count ? ' <span class="dim">(' + esc(q.count.text.toLowerCase()) + ')</span>' : '') + (q.where ? ' <span class="dim">(where)</span>' : '') + '</td><td>' + esc(names(q.adds)) + (more ? '<br><span class="dim">' + more + '</span>' : '') + '</td></tr>';
}).join('');
/* the honest limits: what the catalog itself says */
var toolName = {}; TOOLS.catalog().forEach(function (t) { toolName[t.key] = t.name; });
var limitRows = catalog.filter(function (m) { return m.coverage || m.agreement; }).map(function (m) {
  return '<tr><td><b>' + esc(m.name) + '</b></td><td>' + esc(m.coverage || m.agreement + '.') + '</td></tr>';
}).join('') + M.notSold().filter(function (n) { return /enterprise/i.test(n.reason); }).map(function (n) {
  return '<tr><td><b>' + esc(n.tools.map(function (t) { return toolName[t] || t; }).join(', ')) + '</b></td><td>' + esc(n.reason) + '.</td></tr>';
}).join('');
var betaRows = catalog.filter(function (m) { return m.beta && m.beta.length; }).map(function (m) {
  return '<tr><td><b>' + esc(m.name) + '</b></td><td class="dim">' + esc(m.beta.join(', ')) + '</td></tr>';
}).join('');
var notSold = 'Not sold: ' + M.notSold().filter(function (n) { return !/enterprise/i.test(n.reason); }).map(function (n) {
  return n.tools.map(function (t) { return toolName[t] || t; }).join(', ') + ' (' + n.reason.charAt(0).toLowerCase() + n.reason.slice(1) + ')';
}).join('; ') + '.';

var tokens = {
  LOCKUP_WHITE: dataUri('site-assets/clearsky-omega-white.png'), LOCKUP_NAVY: dataUri('assets/clearsky-omega-dark.png'), CLEARSKY_LOGO: dataUri('site-assets/clearsky-logo-light.png'),
  LITE_PRICE: money(book.modules.lite.priceCents), MODULE_COUNT: String(catalog.length),
  OFFERINGS_URL: HOST + '/offerings', START_URL: HOST + '/start', SUPPORT_EMAIL: SUPPORT, BOOK_VERSION: book.version,
  BUILT_ON: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  LADDER: ladder, MODULE_ROWS_EDITOR: menuRows(['floor', 'addon', 'standard', 'premium']), MODULE_ROWS_PIECE: menuRows(['deliverable', 'platform']), LOGIC_BUNDLE: money(book.logicBundle.priceCents), LOGIC_ALACARTE: money(logicAlacarte), LOGIC_PARTS: logicPartsText,
  PLAN_ROWS: planRows, FEE_ROWS: feeRows, CREDIT_PCT: String(book.credit.pct), CREDIT_DAYS: String(book.credit.days), USAGE_ROWS: usageRows,
  BUILDERS: String(book.logins.builders), VIEWERS: String(book.logins.viewers), BUILDER_PRICE: money(book.logins.builderCents) + ' a month', VIEWER_PRICE: money(book.logins.viewerCents) + ' a month',
  ANNUAL_MONTHS: String(book.annualPaidMonths), ANNUAL_FREE: String(12 - book.annualPaidMonths),
  STARTER_ROWS: starterRows, QUESTION_ROWS: questionRows, LIMIT_ROWS: limitRows, BETA_ROWS: betaRows, NOT_SOLD: esc(notSold)
};
/* the template's own comments name the tokens; they never print */
var html = fs.readFileSync(path.join(__dirname, 'sales-guide.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/%%([A-Z_]+)%%/g, function (all, k) {
  if (!Object.prototype.hasOwnProperty.call(tokens, k)) { console.error('sales-guide: no value for %%' + k + '%%'); process.exit(1); }
  return tokens[k];
});
if (/%%[A-Z_]+%%/.test(html)) { console.error('sales-guide: a token was left unfilled'); process.exit(1); }

(async function () {
  fs.mkdirSync(OUT, { recursive: true }); if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  var b = await chromium.launch({ executablePath: CHROME }), p = await b.newPage();
  var tmp = path.join(__dirname, '.sales-guide.build.html');
  fs.writeFileSync(tmp, html);
  try { await p.goto('file://' + tmp, { waitUntil: 'load' }); } finally { fs.unlinkSync(tmp); }
  await p.emulateMedia({ media: 'print' });
  await p.waitForTimeout(200);
  /* a page is laid out on purpose: content past its box is a broken page, never a silent cut */
  var over = await p.evaluate(function () {
    return Array.prototype.map.call(document.querySelectorAll('.sheet'), function (s, i) {
      var boxes = s.querySelectorAll('.body, .below, .hero'), out = [];
      Array.prototype.forEach.call(boxes, function (box) { var extra = box.scrollHeight - box.clientHeight; if (extra > 1) out.push('sheet ' + (i + 1) + ' (' + box.className + ') runs ' + extra + 'px past its page'); });
      return out.join('; ');
    }).filter(Boolean);
  });
  if (over.length && !DRAFT) { await b.close(); console.error('sales-guide: ' + over.join('; ')); process.exit(1); }
  if (over.length) console.error('sales-guide (draft): ' + over.join('; '));
  var file = path.join(OUT, PDF);
  await p.pdf({ path: file, format: 'Letter', printBackground: true, displayHeaderFooter: false, preferCSSPageSize: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
  var pages = await p.evaluate(function () { return document.querySelectorAll('.sheet').length; });
  console.log(path.relative(ROOT, file) + '  (' + pages + ' pages, price book ' + book.version + ')');
  if (SHOTS) {
    await p.emulateMedia({ media: 'screen' });
    var sheets = await p.$$('.sheet');
    for (var i = 0; i < sheets.length; i++) { var shot = path.join(SHOTS, 'page-' + (i + 1) + '.png'); await sheets[i].screenshot({ path: shot }); console.log('  ' + shot); }
  }
  await b.close();
})().catch(function (e) { console.error(e); process.exit(1); });
