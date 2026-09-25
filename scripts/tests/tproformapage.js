/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The BESS Pro Forma page and its deck renderer, offline.

   Two promises the page makes that no other suite checks:
   - it is safe to serve to every tenant: ES5 only (kiosk browsers), the
     runtime in the order CLAUDE.md requires, the dashboard theme, no tenant
     named in a core file, the © header;
   - the deck it exports says exactly what the engine said: real engine
     results rendered through OmegaProformaReport carry the engine's figures,
     never print NaN / undefined / null / Infinity, escape what a user typed,
     and draw only the parts the project has.

   No DOM, no network, no npm install.
   Run: node scripts/tests/tproformapage.js
*/
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got).slice(0, 300) : '')); }
}
function section(t) { console.log('\n' + t); }

var PAGE = read('proforma.html');
var LOGIC = read('proforma-logic.js');

/* Code with comments, strings and regex-free template text removed, so an ES5
   scan does not trip over "class=" in markup or "=>" in a comment. */
function codeOnly(src) {
  var out = '', i = 0, n = src.length, c, q;
  while (i < n) {
    c = src[i];
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? n : i + 2; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '"' || c === "'" || c === '`') {
      q = c; out += q + q; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; continue;
    }
    out += c; i++;
  }
  return out;
}
function inlineScripts(html) {
  var re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, m, out = [];
  while ((m = re.exec(html))) out.push(m[1]);
  return out.join('\n;\n');
}
var ES2015 = [
  ['arrow function', /=>/], ['let', /(^|[^.\w$])let\s+[\w$[{]/], ['const', /(^|[^.\w$])const\s+[\w$[{]/],
  ['template literal', /``/], ['class declaration', /(^|[^.\w$])class\s+[A-Za-z_$][\w$]*\s*(extends\b|\{)/],
  ['async/await', /(^|[^.\w$])(async\s+function|await\s)/], ['spread', /\.\.\.[\w$[(]/],
  ['Object.assign', /Object\.assign\s*\(/], ['Object.entries/values', /Object\.(entries|values)\s*\(/],
  ['Array includes/find', /\.(includes|find|findIndex)\s*\(/], ['startsWith/endsWith/padStart', /\.(startsWith|endsWith|padStart|padEnd)\s*\(/]
];
function es5(name, src) {
  var code = codeOnly(src), bad = [];
  ES2015.forEach(function (r) { if (r[1].test(code)) bad.push(r[0]); });
  ok(name + ' is ES5', bad.length === 0, bad);
}

section('the page is safe to serve to every tenant');
es5('proforma.html inline script', inlineScripts(PAGE));
es5('proforma-logic.js', LOGIC);
ok('proforma.html carries the © header', /© 2025–2026 ClearSky Energy Solutions LLC\. Proprietary and Confidential\./.test(PAGE.slice(0, 800)));
ok('proforma-logic.js carries the © header', /© 2025–2026 ClearSky Energy Solutions LLC\. Proprietary and Confidential\./.test(LOGIC.slice(0, 400)));
var srcs = []; PAGE.replace(/<script[^>]*\bsrc="([^"]+)"/g, function (m, s) { srcs.push(s); return m; });
var ib = srcs.indexOf('/omega-brand.js'), it = srcs.indexOf('/omega-tenant.js'), iw = srcs.indexOf('/omega-whitelabel.js');
ok('omega-tenant.js loads directly after omega-brand.js', ib >= 0 && it === ib + 1, srcs);
ok('omega-whitelabel.js loads directly after omega-tenant.js', iw === it + 1, srcs);
ok('config.js loads before omega-brand.js', srcs.indexOf('/config.js') >= 0 && srcs.indexOf('/config.js') < ib, srcs);
ok('the deck renderer is loaded', srcs.indexOf('/proforma-logic.js') > iw, srcs);
ok('the dashboard theme is linked last, before </body>', /<link[^>]+href="\/omega-theme\.css"[^>]*>\s*<\/body>/i.test(PAGE));
ok('the page title names the tool, not a tenant', /<title>BESS Pro Forma<\/title>/.test(PAGE));

/* Case-sensitive on purpose: 'costAfter' contains 'tAft'. */
var TENANTS = /NextNRG|Next NRG|nextnrg|Tremco|Clean ?Cell|cleancell|Topanga|Sunnyside|\bTaft\b|Miami Beach|Monday\.com|Concord|FENECON|Fenecon/;
['proforma.html', 'proforma-logic.js', 'api/proforma.js', 'api/_lib/proforma-engine.js', 'api/_lib/proforma-sizing.js'].forEach(function (f) {
  var m = read(f).match(TENANTS);
  ok(f + ' names no tenant', !m, m && m[0]);
});
ok('the page computes no IRR itself', !/function\s+(irr|npv|macrs|calcIRR)\s*\(/i.test(inlineScripts(PAGE)));
ok('the old EV-charging steps are gone', !/Charging Data|stationType|numPorts|mondayId/.test(PAGE));

section('the deck says what the engine said');
var E = require(path.join(ROOT, 'api', '_lib', 'proforma-engine'));
var sandbox = { console: console, module: { exports: {} } };
sandbox.window = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(LOGIC, sandbox, { filename: 'proforma-logic.js' });
var R = sandbox.module.exports && sandbox.module.exports.render ? sandbox.module.exports : sandbox.OmegaProformaReport;
ok('OmegaProformaReport loads without a DOM', !!(R && R.render && R.documentHtml && R.brandFrom && R.palette));

function lines(list) { return { lines: list }; }
var SOLAR = {
  years: 28,
  project: { name: 'Hilltop Solar + Storage <script>alert(1)</script>', sponsor: 'Acme Energy LLC', host: 'Hilltop Care Center',
    hostDescription: 'Skilled nursing facility', city: 'Canoga Park', state: 'CA', zip: '91304', acres: 1.1,
    preparedDate: '2026-09-24', bocMonth: '2027-02', pisMonth: '2027-10' },
  solar: { kwDc: 315, kwh1: 530984 },
  bess: { kw: 300, kwh: 1800 },
  controller: true,
  capex: lines([
    { id: 'pv', label: 'Solar PV', amount: 1100000, asset: 'solar', itcEligible: 1, depClass: 'energy' },
    { id: 'bess', label: 'Battery storage', amount: 620000, asset: 'storage', itcEligible: 1, depClass: 'energy' },
    { id: 'ctl', label: 'Site controller', amount: 60000, asset: 'controller', itcEligible: 1, depClass: 'energy' }
  ]),
  revenue: { ppa: { rate1: 0.225, escalatorPct: 2.5, basis: 'gross' }, bess: { mode: 'bundled' } },
  opex: lines([{ id: 'om', label: 'Operations & maintenance', perYear: 22001, escalatorPct: 2.5 }]),
  tax: { itc: { solar: { energyCommunity: true }, storage: { energyCommunity: true } } }
};
var BATTERY = {
  years: 20,
  project: { name: 'Depot Battery', sponsor: 'Acme Energy LLC', host: 'Metro Depot', city: 'Joliet', state: 'IL',
    preparedDate: '2026-09-24', bocMonth: '2027-03', pisMonth: '2027-09' },
  solar: null, ev: null, controller: false,
  bess: { kw: 500, kwh: 2000 },
  capex: lines([{ id: 'bess', label: 'Battery storage', amount: 900000, asset: 'storage', itcEligible: 1, depClass: 'energy' }]),
  revenue: { ppa: null, bess: { mode: 'fixed', fixedPerKwMonth: 14, escalatorPct: 2 } },
  opex: lines([{ id: 'om', label: 'Battery O&M', perYear: 9000, escalatorPct: 2.5 }])
};
var solar = E.run(SOLAR), battery = E.run(BATTERY);
ok('the solar + storage case models', solar.ok === true, solar.errors);
ok('the battery-only case models', battery.ok === true, battery.errors);

var brand = R.brandFrom({ name: 'Acme Energy', logoUrl: '', colors: null, tagline: 'Built for what’s NEXT', attribution: '', platformName: 'ClearSky-OMEGA' }, { accent: '#2E7D5B' });
function textOf(html) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
}
function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
function clean(name, html) {
  var t = textOf(html), m = t.match(/\bNaN\b|\bundefined\b|\bInfinity\b|\bnull\b|\[object Object\]/);
  ok(name + ': no NaN / undefined / null / Infinity in the text', !m, m && t.slice(Math.max(0, m.index - 60), m.index + 40));
  return t;
}

if (solar.ok) {
  var html = R.render(solar, brand, { include: { sizing: false, cashflow: true, disclosures: true } });
  var t = clean('solar + storage', html);
  ['pf-cover', 'pf-overview', 'pf-numbers', 'pf-cashflow', 'pf-disclosures', 'pf-close'].forEach(function (c) {
    ok('solar + storage renders ' + c, html.indexOf(c) >= 0);
  });
  ok('a typed <script> is escaped, never markup', html.indexOf('<script>alert(1)') < 0 && /&lt;script&gt;alert\(1\)/.test(html));
  var irr = (Math.round(solar.metrics.afterTaxIrr * 1000) / 10).toFixed(1) + '%';
  ok('the after-tax IRR on the deck is the engine\'s (' + irr + ')', t.indexOf(irr) >= 0);
  ok('total uses on the deck are the engine\'s', t.indexOf(money(solar.sourcesUses.totalUses)) >= 0, money(solar.sourcesUses.totalUses));
  ok('the ITC on the deck is the engine\'s', t.indexOf(money(solar.tax.itc.face)) >= 0, money(solar.tax.itc.face));
  ok('year-1 PPA revenue on the deck is the engine\'s', t.indexOf(money(solar.revenue.year1.ppa)) >= 0, money(solar.revenue.year1.ppa));
  ok('the headline names the solar and the storage', /315 kW DC solar/.test(t) && /MWh storage|kWh storage/.test(t));
  ok('the producing tenant\'s name is on the deck', /Acme Energy/.test(t));
  var doc = R.documentHtml(solar, brand, {});
  ok('the printable document sets a 16:9 page', /@page\s*\{[^}]*size:\s*10in\s+5\.625in/.test(doc));
}
/* The fullest page 3 a site can produce: solar, storage, EV charging and a
   controller, a storage fee on top of the PPA, demand response and a loan.
   Financing teams read the levelized price and LCOE first, so they must
   survive a full Revenue & Opex column; anything that does not fit is
   reported by omitted(), never dropped in silence. */
var FULL = JSON.parse(JSON.stringify(SOLAR));
FULL.ev = { kw: 125 };
FULL.capex.lines.push({ id: 'ev', label: 'EV charging make-ready', amount: 120000, asset: 'ev', itcEligible: 0, depClass: 'macrs5' });
FULL.revenue.bess = { mode: 'fixed', fixedPerKwMonth: 6, escalatorPct: 2 };
FULL.revenue.ev = { perKwYear: 80, escalatorPct: 0 };
FULL.revenue.dr = { perYear: 25000, inBase: false };
FULL.debt = { sizing: 'min', ltcPct: 45, ratePct: 7.5, tenorYears: 15, dscrMin: 1.35, shape: 'sculpted', feePct: 1.5, dsraMonths: 6 };
var full = E.run(FULL);
ok('the full solar + storage + EV + controller + debt case models', full.ok === true, full.errors);
if (full.ok) {
  var fh = R.render(full, brand, {}), ft = clean('full case', fh);
  var gone = R.omitted(full, brand, {});
  ok('omitted() reports what page 3 left out, as a list', Array.isArray(gone));
  var goneKeys = gone.map(function (g) { return g.label; }).join(' | ');
  ok('the levelized PPA price is on the deck (or named as left out)', /Levelized PPA price/.test(ft) || /Levelized PPA price/.test(goneKeys), goneKeys);
  ok('the LCOE is on the deck (or named as left out)', /LCOE/.test(ft) || /LCOE/.test(goneKeys), goneKeys);
  ok('the levelized price and LCOE are never the lines that give way', !/Levelized PPA price|LCOE/.test(goneKeys), goneKeys);
  ok('a levered deck says equity and debt', /equity sought/i.test(ft) && /debt at 7\.5%/.test(ft));
  ok('EV charging appears in the system flow when the site has it', /EV Charging/.test(ft));
}

if (battery.ok) {
  var bh = R.render(battery, brand, {});
  var bt = clean('battery only', bh);
  ok('battery only: the headline is the battery, not solar', !/kW DC solar/.test(bt) && /battery|storage/i.test(bt));
  ok('battery only: no PPA terms banner', !/-year PPA/.test(bt));
  ok('battery only: no levelized PPA price or LCOE line', !/Levelized PPA price|LCOE \(nominal\)/.test(bt));
  ok('battery only: no EV charging in the system flow', !/EV Charging/.test(bt));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
