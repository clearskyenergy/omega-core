/* THE EVERSOURCE MA ESTIMATE, FILLED, READS IN EVERY VIEWER.

   Eversource's March 2026 template writes its arithmetic against an Excel
   table: SimpleInvoice[[#This Row],[Material Total]]+SimpleInvoice[[#This
   Row],[Labor Total]]. Excel reads that. Google Sheets shows #ERROR! in
   every total; Numbers, Quick Look and a mail preview show nothing, because
   the export used to strip the cached results and leave the recalculation
   to Excel. A customer found out on the day they filed (2026-09-28).

   So the filled sheet carries the same arithmetic as plain references with
   the result cached in each cell. This runs the real converter over EVERY
   formula the shipped template carries (a new revision with a shape it
   cannot name fails here, not on a reviewer's screen), fills the real
   template with a ten-port job and pins the totals, and pins the design
   rule that job exposed: Eversource (CT and MA) books design as one flat
   figure, not $1,000 a port.

   No zip library in this repo's node, so the template is read with a
   twenty-line central-directory reader. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..', '..');
let fails = 0;
function ok(c, m){ console.log('  ' + (c ? 'ok  ' : 'FAIL') + '   ' + m); if(!c) fails++; }
function near(a, b){ return Math.abs(a - b) < 0.005; }

/* ── the template, out of its zip ─────────────────────────────────────── */
function zipEntry(buf, name){
  let eocd = -1;
  for(let i = buf.length - 22; i >= 0; i--){ if(buf.readUInt32LE(i) === 0x06054b50){ eocd = i; break; } }
  if(eocd < 0) throw new Error('no zip directory');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for(let k = 0; k < n; k++){
    if(buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const nm = buf.toString('utf8', p + 46, p + 46 + nlen);
    if(nm === name){
      const ln = buf.readUInt16LE(off + 26), le = buf.readUInt16LE(off + 28), start = off + 30 + ln + le;
      const data = buf.slice(start, start + csize);
      return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    }
    p += 46 + nlen + elen + clen;
  }
  throw new Error('not in zip: ' + name);
}
const XLSX = fs.readFileSync(path.join(ROOT, 'assets/utility-templates/eversource-ma-ev-estimate-2026-03.xlsx'));
const SHEET = zipEntry(XLSX, 'xl/worksheets/sheet1.xml');
const TABLE = zipEntry(XLSX, 'xl/tables/table1.xml');
const WBX   = zipEntry(XLSX, 'xl/workbook.xml');
const WRELS = zipEntry(XLSX, 'xl/_rels/workbook.xml.rels');
const SRELS = zipEntry(XLSX, 'xl/worksheets/_rels/sheet1.xml.rels');

/* ── the page's own functions ─────────────────────────────────────────── */
const html = fs.readFileSync(path.join(ROOT, 'ev-cost-workbook.html'), 'utf8');
function grab(name){
  const needle = 'function ' + name + '(';
  const hits = [];
  for(let k = html.indexOf(needle); k >= 0; k = html.indexOf(needle, k + 1)) hits.push(k);
  if(hits.length !== 1) throw new Error(name + ' appears ' + hits.length + ' times in ev-cost-workbook.html');
  let k = html.indexOf('{', hits[0]), d = 0;
  for(;; k++){
    if(html[k] === '{') d++;
    else if(html[k] === '}'){ d--; if(!d) break; }
  }
  return html.slice(hits[0], k + 1);
}
const NAMES = ['num','r2','d','uniqJoin','_xmlEsc','_xmlUnesc','_colNum','_colLetter','esmaSetCell',
               'esmaTable','esmaColName','esmaA1','esmaFormulasToA1','esmaCells','esmaEval',
               'esmaCacheResults','esmaTableXmlPlain','esmaWorkbookXml','esmaSheetName','esmaResolve',
               'esmaRollup','esmaFillXml','designRate'];
const direct = /var ESMA_MAT_DIRECT\s*=\s*(\{[^}]*\});/.exec(html);
ok(!!direct, 'ESMA_MAT_DIRECT is on the page');
const ctx = { DATA:{}, EDITOR_FLEET:null, console };
vm.createContext(ctx);
vm.runInContext('var ESMA_MAT_DIRECT=' + direct[1] + ';\n' + NAMES.map(grab).join('\n') + '\n', ctx);
const P = ctx;

/* ── 1. every formula the shipped template carries converts ───────────── */
console.log('1. the template\'s structured references, in plain A1');
const T = P.esmaTable(TABLE);
ok(T && T.name === 'SimpleInvoice' && T.head === 8 && T.first === 9 && T.lastData === 62, 'table read: SimpleInvoice, header row 8, data 9..62');
ok(T.cols['Material Qty'] === 'E' && T.cols['Material Unit Price'] === 'F' && T.cols['Material Total'] === 'G'
   && T.cols['Labor Total'] === 'H' && T.cols['Total Cost'] === 'J', 'columns land on E F G H J');
ok(/SimpleInvoice\[\[#This Row\]/.test(SHEET), 'the shipped template does write table references (the thing being fixed)');
const formulas = [];
SHEET.replace(/<c r="([A-Z]+)(\d+)"[^>]*><f[^>]*>([^<]*)<\/f>/g, (a, c, r, f) => { formulas.push({ ref:c + r, row:+r, f:P._xmlUnesc(f) }); });
ok(formulas.length > 60, formulas.length + ' formulas on the sheet');
let converted = 0, threw = null;
const a1 = {};
for(const c of formulas){
  try{ a1[c.ref] = P.esmaA1(c.f, c.row, T); converted++; }catch(e){ threw = c.ref + ': ' + e.message; break; }
}
ok(!threw, 'every one converts' + (threw ? ' — ' + threw : ''));
ok(Object.keys(a1).every(k => a1[k].indexOf('SimpleInvoice') < 0), 'no table reference survives');
ok(a1.J10 === 'G10+H10', 'J10: ' + a1.J10);
ok(a1.G13 === 'E13*F13', 'G13: ' + a1.G13);
ok(a1.J37 === 'G37', 'J37 (networking, material only): ' + a1.J37);
ok(a1.J57 === 'SUM(J10:J11,J13:J25)', 'J57 was plain and stays plain: ' + a1.J57);
ok(a1.J64 === 'SUM(J61:J62)', 'J64 grand total: ' + a1.J64);
/* the shapes Excel can also write, so a re-saved template still converts */
ok(P.esmaA1('SUM(SimpleInvoice[Total Cost])', 20, T) === 'SUM($J$9:$J$62)', 'a whole column is the data area, absolute');
ok(P.esmaA1('SimpleInvoice[@[Material Qty]]*SimpleInvoice[@[Material Unit Price]]', 20, T) === 'E20*F20', 'the @ short form');
ok(P.esmaA1('SimpleInvoice[[#Headers],[Description]]', 1, T) === '$B$8', 'a header cell');
ok(P.esmaA1('SUM(SimpleInvoice[[#This Row],[Material Total]:[Labor Total]])', 15, T) === 'SUM(G15:H15)', 'a column range on this row');
let bad = null; try{ P.esmaA1('SimpleInvoice[[#This Row],[No Such Column]]', 10, T); }catch(e){ bad = e.message; }
ok(!!bad, 'an unknown column throws rather than passing through: ' + bad);

/* ── 2. the real template filled with a ten-port job ──────────────────── */
console.log('2. the filled sheet carries its totals');
function row(k, esma, mat, lab, qty, note){ return { def:{ esma }, mat, lab, qty, note }; }
const model = { taxTotal:1375, blocks:[
  { rows:[
    row('design',    { row:10 }, 0, 2000, 1, 'Design Costs'),
    row('permit',    { row:11 }, 0, 2501.91, 1, 'Permitting Costs'),
    row('trench',    { row:13, qty:'ftTrenchPaved' }, 1590, 8480, 106, 'Trenching/Restoration'),
    row('conduit',   { row:15, qty:'ftConduitUG' }, 1263.6, 1620, 648, 'Conduit & Conductors'),
    row('conduitAG', { row:16, qty:'ftConduitAG' }, 19.5, 1172.5, 10, 'Conduit & Cable — Above Ground/Indoor'),
    row('bollard',   { row:17 }, 2500, 3000, 10, 'Protective Bollards'),
    row('panel',     { row:23 }, 500, 285, 1, 'Utility service point'),
    row('meter',     { row:24 }, 900, 285, 1, 'Utility service meter'),
    row('other',     { row:25 }, 1200.03, 9547.5, 13, 'Service transformer, grounding')
  ]},
  { rows:[
    row('charger',   { row:31, qty:'plugs' }, 22000, 0, 10, 'EVSE Hardware'),
    row('install',   { row:34, qty:'plugs' }, 0, 12500, 10, 'EVSE Installation'),
    row('network',   { row:37, qty:'plugs' }, 4800, 100, 10, 'Networking')
  ]}
]};
Object.assign(P.DATA, { plugs:10, ftTrenchPaved:106, ftConduitUG:648, ftConduitAG:10, esmaSub:'N',
                        esmaProjNo:'ESMAEV-00001', address:'68 Union St', city:'Pittsfield, MA 01201' });
const filled = P.esmaFillXml(SHEET, model, [T]);
ok(filled.indexOf('SimpleInvoice[') < 0, 'no table reference left on the filled sheet');
const cells = P.esmaCells(filled);
function cached(ref){ const c = cells[ref]; return c && c.f != null ? c.v : undefined; }
ok(cells.E13.v === 106 && cells.F13.v === 15, 'trench: 106 ft at $15');
ok(near(cached('G13'), 1590) && near(cached('J13'), 10070), 'G13 = 1590 and J13 = 10070 are cached');
ok(near(cached('G25'), 1200.03), 'a lump sum written as 13 x 92.31 comes back to the cent');
ok(near(cached('J10'), 2000) && near(cached('J11'), 2501.91), 'design and permitting totals cached off the labour cell');
ok(!/<c r="G10"[^>]*>\s*<v>/.test(filled), 'no 0 is written into Material Total on the design row');
ok(near(cached('J37'), 4900) && near(cached('J60'), 4900), 'networking: labour folded into the charge, J60 = J37 = 4900');
ok(near(cached('J57'), 36865.04), 'J57 customer-side make-ready = 36,865.04 (' + cached('J57') + ')');
ok(near(cached('J58'), 0), 'J58 utility-side = 0');
ok(near(cached('J59'), 34500), 'J59 EVSE = 34,500');
ok(near(cached('J61'), 76265.04), 'J61 eligible total = 76,265.04');
ok(near(cached('J62'), 1375), 'J62 ineligible = the tax line');
ok(near(cached('J64'), 77640.04), 'J64 estimate total = 77,640.04');
ok(/<c r="J57"[^>]*><f>SUM\(J10:J11,J13:J25\)<\/f><v>36865\.04<\/v><\/c>/.test(filled), 'the cell is written as <f> then <v>');
ok(filled.indexOf('<is><t xml:space="preserve">Pittsfield, MA 01201</t></is>') > 0, 'site fields still land');
/* a formula this cannot work out keeps no stale 0 */
const odd = P.esmaCacheResults('<row r="2"><c r="A2"><f>UNKNOWNFN(B2)</f><v>0</v></c><c r="B2"><v>3</v></c></row>');
ok(odd.indexOf('<v>0</v>') < 0 && odd.indexOf('<f>UNKNOWNFN(B2)</f>') > 0, 'an unknown function keeps its formula and drops the stale 0');

/* ── 3. the table part and workbook.xml ───────────────────────────────── */
console.log('3. the parts around the sheet');
ok(/<calculatedColumnFormula>/.test(TABLE) && !/<calculatedColumnFormula>/.test(P.esmaTableXmlPlain(TABLE)), 'the table\'s column formulas go, the table stays');
ok(/<tableColumn\b/.test(P.esmaTableXmlPlain(TABLE)), 'table columns are untouched');
const name = P.esmaSheetName(WBX, WRELS, 'xl/worksheets/sheet1.xml');
ok(name === 'Cost Matrix ESMA', 'sheet1 is ' + name);
const wbx2 = P.esmaWorkbookXml(WBX, [T], name);
ok(/<calcPr\b[^>]*fullCalcOnLoad="1"/.test(wbx2), 'fullCalcOnLoad is set');
ok(wbx2.indexOf("<definedName name=\"ColumnTitle1\">'Cost Matrix ESMA'!$B$8</definedName>") > 0, 'the table-bound defined name reads as a cell');
ok(wbx2.indexOf('SimpleInvoice[') < 0, 'no table reference left in workbook.xml');
ok(P.esmaResolve('xl/worksheets/sheet1.xml', '../tables/table1.xml') === 'xl/tables/table1.xml', 'the table part resolves from the sheet rels');
ok(/Type="[^"]*\/table" Target="\.\.\/tables\/table1\.xml"/.test(SRELS), 'sheet1 relates to table1 the way the writer looks it up');

/* ── 4. design: flat on Eversource MA, per port elsewhere ─────────────── */
console.log('4. design & engineering');
function formBlock(name){ const i = html.indexOf('var ' + name + ' = {'); return html.slice(i, html.indexOf('\n};', i)); }
ok(/designFlat:2000,/.test(formBlock('FORM_ES_MA_L2')), 'FORM_ES_MA_L2 carries designFlat:2000');
ok(/designFlat:2000,/.test(formBlock('FORM_ES_CT_L2')), 'FORM_ES_CT_L2 carries it too (2026-09-28: every Eversource form is flat)');
ok(!/designFlat/.test(formBlock('FORM_UI_L2')) && !/designFlat/.test(formBlock('FORM_NG_MA')), 'United Illuminating and National Grid stay per port');
ok((html.match(/designFlat:\d+/g) || []).length === 2, 'and nothing else says flat');
const MA = { designFlat:2000, short:'Eversource MA — L2' }, CT = { short:'United Illuminating — L2' };
let r = P.designRate(MA, 10, {});
ok(r && r.lab === 2000 && r.qty === 1 && r.unit === 'LS', 'Eversource MA, ten ports: $2,000 flat, not $10,000');
r = P.designRate(MA, 2, {});
ok(r && r.lab === 2000, 'Eversource MA, two ports: still $2,000');
r = P.designRate(MA, 10, { _designFlat:2500 });
ok(r && r.lab === 2500, 'Rate settings can move the flat figure');
r = P.designRate(CT, 10, {});
ok(r && r.lab === 10000 && r.qty === 10, 'a form without the rule keeps $1,000 a port');
r = P.designRate({ designFlat:2000, short:'Eversource CT — L2' }, 4, {});
ok(r && r.lab === 2000 && r.qty === 1, 'Eversource CT, four ports: $2,000 flat, not $4,000');
r = P.designRate(CT, 4, { _designPerPort:1200 });
ok(r && r.lab === 4800, 'the per-port override still applies there');
ok(P.designRate(CT, 0, {}) === null, 'no ports, no per-port design line');
ok(/case 'design':\s*return designRate\(FORM, ports, RATE_CARD\);/.test(html), 'standardRate asks designRate');
ok(/function render\(\)\{ syncCivil\(\); syncDesign\(\); syncPermit\(\);/.test(html), 'render re-reads design before permitting');
ok(/form\.designFlat && l\.row==='design' && !l\.pinned/.test(html), 'buildModel prices design for the form being written');
ok(/\(LINES\[i\]\.row==='permit'\|\|LINES\[i\]\.row==='design'\) && \(field==='mat'\|\|field==='lab'\)\) LINES\[i\]\.pinned=true/.test(html), 'a typed-over design figure is pinned');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
