/* THE NATIONAL GRID PRICE BOOK, PINNED.

   Concord Energy's instructions (v2, 2026-09-28) carry five reference jobs
   priced to the book and say: "The software's output for these inputs must
   reproduce these totals exactly." This runs the page's own pure pricer
   over those five jobs and checks H47 (make-ready), H48 (EVSE), H49
   (networking), H51 (ineligible), H52 (tax, half-up) and H53, plus the
   line level of 18 Blanche St that the instructions spell out. A rate
   change moves these on purpose, with a commit message.

   It also pins the rules around the numbers: the asks (service scope, the
   80 A unit, unpaved trench, handholes) are flags and never guesses, the
   markup is never applied, the tax base is make-ready material plus
   signage and nothing else, and S = P / 2. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
let fails = 0;
function ok(c, m){ console.log('  ' + (c ? 'ok  ' : 'FAIL') + '   ' + m); if(!c) fails++; }
function near(a, b){ return Math.abs(a - b) < 0.005; }

const html = fs.readFileSync(path.join(ROOT, 'ev-cost-workbook.html'), 'utf8');
function grab(name){
  const needle = 'function ' + name + '(';
  const hits = [];
  for(let k = html.indexOf(needle); k >= 0; k = html.indexOf(needle, k + 1)) hits.push(k);
  if(hits.length !== 1) throw new Error(name + ' appears ' + hits.length + ' times');
  let k = html.indexOf('{', hits[0]), d = 0;
  for(;; k++){ if(html[k] === '{') d++; else if(html[k] === '}'){ d--; if(!d) break; } }
  return html.slice(hits[0], k + 1);
}
/* A var's literal, by bracket depth — skipping strings and comments, so a
   one-line object or a bracket inside a note does not fool it. */
function grabVar(name){
  const i = html.indexOf('var ' + name + ' = ');
  if(i < 0) throw new Error('no var ' + name);
  let k = i + ('var ' + name + ' = ').length, d = 0, q = null;
  for(; k < html.length; k++){
    const c = html[k], n = html[k + 1];
    if(q){ if(c === '\\'){ k++; continue; } if(c === q) q = null; continue; }
    if(c === '/' && n === '*'){ k = html.indexOf('*/', k + 2) + 1; continue; }
    if(c === '/' && n === '/'){ k = html.indexOf('\n', k); continue; }
    if(c === "'" || c === '"'){ q = c; continue; }
    if(c === '{' || c === '['){ d++; continue; }
    if(c === '}' || c === ']'){ d--; if(!d) break; }
  }
  return html.slice(i, k + 1) + ';';
}
const src = ['NG_PRICE','NG_SERVICE_OPTIONS','NG_SERVICE_KEYS','NG_ROW_ALIAS','NG_BOOK_ROWS','NG_UTIL_ROWS','BLOCKS_NG_MA','NG_LAYOUT']
  .map(grabVar).join('\n') + '\n' +
  ['num','r2','money','ngRound','ngStationsFor','ngRowOf','ngTaxBase','ngPriceBook','ngChanges','ngRowLabel'].map(grab).join('\n');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const P = ctx;

/* Sums by sheet row, the way ngRollup and the sheet's own SUMs do. */
function totals(lines){
  const by = {};
  for(const l of lines){
    if(l.util || l.bucket === 'fp') continue;
    const r = P.ngRowOf(l);
    by[r] = by[r] || { mat:0, lab:0, qty:0 };
    by[r].mat += P.num(l.mat); by[r].lab += P.num(l.lab); by[r].qty += P.num(l.qty);
  }
  const sum = (a, b) => { let t = 0; for(let r = a; r <= b; r++) if(by[r]) t += P.r2(by[r].mat) + P.r2(by[r].lab); return P.r2(t); };
  const tax = P.ngRound(P.ngTaxBase(lines).mat * P.NG_PRICE.taxRate);
  const H47 = sum(10, 19), H48 = sum(27, 30), H49 = sum(32, 32), H51 = P.r2(sum(34, 34) + sum(36, 40) + sum(42, 46));
  return { by, H47, H48, H49, H51, H52: tax, H53: P.r2(H47 + H48 + H49 + H51 + tax) };
}
function job(o){ return Object.assign({ unpaved:0, handholes:0, ports80:0, hw80PerPort:0, extras:[], submitted:[] }, o); }

console.log('1. the five reference jobs (instructions s14)');
const REF = [
  { name:'2303 Main St, West Warren',  segment:'Multi-Unit Dwelling (MUD)', ports:8,  paved:180, conduit:892, service:'three',    H47:91348.80, H48:21000, H49:3840, H51:590, H52:1287.80 },
  { name:'580 W Boylston St, Worcester', segment:'Workplace',               ports:10, paved:105, conduit:671, service:'three',    H47:89492.40, H48:26250, H49:4800, H51:590, H52:1167.81 },
  { name:'31 Caroline St, Worcester',  segment:'Workplace',                 ports:10, paved:174, conduit:854, service:'three',    H47:99957.60, H48:26250, H49:4800, H51:590, H52:1318.91 },
  { name:'33 Hermon St, Worcester',    segment:'Multi-Unit Dwelling (MUD)', ports:6,  paved:71,  conduit:280, service:'standard', H47:44392.22, H48:15750, H49:2880, H51:590, H52:497.70 },
  { name:'18 Blanche St, Worcester',   segment:'Multi-Unit Dwelling (MUD)', ports:4,  paved:38,  conduit:184, service:'three',    H47:49121.60, H48:10500, H49:1920, H51:590, H52:843.73, H53:62975.33 }
];
for(const j of REF){
  const R = P.ngPriceBook(job(j)), T = totals(R.lines);
  const good = near(T.H47, j.H47) && near(T.H48, j.H48) && near(T.H49, j.H49) && near(T.H51, j.H51) && near(T.H52, j.H52) && (j.H53 == null || near(T.H53, j.H53));
  ok(good, j.name + ': H47 ' + T.H47 + ' H48 ' + T.H48 + ' H49 ' + T.H49 + ' H51 ' + T.H51 + ' H52 ' + T.H52 + ' H53 ' + T.H53);
  ok(!R.flags.some(f => f.ask), '  no ask on a fully specified job (' + R.flags.filter(f => f.ask).map(f => f.text).join(' | ') + ')');
}

console.log('2. 18 Blanche St, line by line (s14.1)');
const B = P.ngPriceBook(job(REF[4])), TB = totals(B.lines), by = TB.by;
const row = (r, mat, lab, qty) => ok(by[r] && near(by[r].mat, mat) && near(by[r].lab, lab) && (qty == null || by[r].qty === qty),
  'row ' + r + ': ' + (by[r] ? by[r].mat + ' / ' + by[r].lab + ' x' + by[r].qty : 'missing') + ' (want ' + mat + ' / ' + lab + ')');
row(10, 0, 5692, 4); row(12, 1140, 4180, 38); row(14, 349.60, 1560, 184); row(15, 500, 600, 2); row(17, 1000, 2000, 2);
row(18, 8910, 12550, 1); row(19, 1200, 9440, 4); row(27, 8000, 0, 4); row(28, 2300, 0, 2); row(29, 200, 0, 4); row(32, 1920, 0, 4); row(34, 400, 190, 5);
ok(near(TB.H52, 843.73), 'tax 6.25% x (13,099.60 + 400) = 843.725 rounds half-up to 843.73 (' + TB.H52 + ')');
ok(P.ngRound(843.725) === 843.73 && P.ngRound(1205.925) === 1205.93, 'ngRound is half-up at the half cent');
ok(B.S === 2 && P.ngStationsFor(10) === 5 && P.ngStationsFor(5) === 3, 'S = P / 2, rounded up');
ok(B.lines.every(l => l.src === 'ngbook' && l.fp === 0), 'every book line is marked as the book\'s and carries no future-proofing split');

console.log('3. the asks are flags, never guesses');
let R = P.ngPriceBook(job({ ports:4, paved:38, conduit:184, service:'' }));
ok(R.flags.some(f => f.ask && /Service scope/.test(f.text) && /21,460/.test(f.text)), 'no service scope: asks, with the dollar impact of each option');
ok(near(totals(R.lines).by[18].mat + totals(R.lines).by[18].lab, 2072.22), '  and prices the standard package meanwhile');
R = P.ngPriceBook(job({ ports:4, paved:38, conduit:184, service:'', servicePedestals:2 }));
ok(R.flags.some(f => f.ask && /2 service pedestals/.test(f.text) && /phase is not confirmed/.test(f.text)), 'a drawn service pedestal is named in the ask: a new service whose phase is still to confirm');
R = P.ngPriceBook(job({ ports:4, paved:38, conduit:184, service:'standard', servicePedestals:1 }));
ok(R.flags.some(f => !f.ask && /standard package, but the drawing has 1 service pedestal/.test(f.text)), 'the standard package against a drawn service pedestal is flagged');
R = P.ngPriceBook(job({ ports:4, paved:38, conduit:184, service:'standard', ports80:2 }));
ok(R.flags.some(f => f.ask && /80 A/.test(f.text)) && near(totals(R.lines).by[27].mat, 4000), 'two 80 A ports with no price: asks, those ports at $0, the 50 A ones at $2,000');
R = P.ngPriceBook(job({ ports:4, paved:38, conduit:184, service:'standard', ports80:2, hw80PerPort:3050 }));
ok(!R.flags.some(f => /80 A/.test(f.text)) && near(totals(R.lines).by[27].mat, 10100), 'an entered 80 A price is used: 2 x 2,000 + 2 x 3,050');
R = P.ngPriceBook(job({ ports:4, paved:0, unpaved:60, conduit:184, service:'standard' }));
ok(R.flags.some(f => f.ask && /unpaved/.test(f.text)) && near(totals(R.lines).by[13].mat, 0), 'unpaved trench: no rate, on the sheet at $0, asked');
R = P.ngPriceBook(job({ ports:4, paved:0, unpaved:60, conduit:184, service:'standard', unpavedTyped:{ mat:600, lab:3300 } }));
ok(near(totals(R.lines).by[13].mat, 600) && near(totals(R.lines).by[13].lab, 3300) && R.flags.some(f => f.ask && /confirm/.test(f.text)), 'a typed unpaved rate is the answer, still to confirm');
R = P.ngPriceBook(job({ ports:4, paved:38, conduit:184, service:'standard', handholes:2 }));
ok(R.flags.some(f => f.ask && /handhole/.test(f.text)), 'handholes: asked');
R = P.ngPriceBook(job({ ports:10, paved:105, conduit:671, service:'three', segment:'Workplace' }));
ok(R.flags.some(f => !f.ask && /row 45/.test(f.text)) && near(totals(R.lines).H49, 4800), 'a Workplace site: networking stays on row 32 and is flagged for row 45');
R = P.ngPriceBook(job({ ports:5, paved:38, conduit:184, service:'standard', markupPct:12, stationsTyped:5, pedestalsDrawn:5 }));
ok(R.S === 3 && R.flags.some(f => /not an even number/.test(f.text)), 'an odd port count rounds S up and says so');
ok(R.flags.some(f => /markup is not applied/.test(f.text)), 'the markup knob is reported as not applied');
ok(R.flags.some(f => /C7 is written as S = 3/.test(f.text)) && R.flags.some(f => /placed 5 pedestals/.test(f.text)), 'a typed station count and a drawn pedestal count that differ from S are flagged');
R = P.ngPriceBook(job({ ports:0 }));
ok(R.lines.length === 0 && R.flags.some(f => f.ask && /Number of Ports/.test(f.text)), 'no ports: nothing priced, asked');

console.log('4. what passes through, and the tax base');
const util = { desc:'Utility transformer pad', bucket:'mr', row:'xfmrpad', qty:1, mat:1200, lab:1300, fp:0, util:true };
const kit = { desc:'Cable management kits', bucket:'evse', row:'other', qty:4, mat:640, lab:0, fp:0 };
const fp = { desc:'Spare conduit', bucket:'fp', row:'conduit', qty:40, mat:78, lab:100, fp:0 };
R = P.ngPriceBook(job({ ports:4, paved:38, conduit:184, service:'three', extras:[util, kit, fp] }));
const T4 = totals(R.lines);
ok(near(T4.H47, 49121.60) && near(T4.H48, 10500 + 640), 'a utility-side pad stays out of H47; an EVSE kit rides row 30 as submitted');
ok(R.flags.some(f => /Utility-side rows/.test(f.text) && /2,500/.test(f.text)), 'the utility-side amount is flagged, excluded from H53 and the proposal');
ok(R.flags.some(f => /Not in the price book/.test(f.text) && /Cable management/.test(f.text)), 'the kit is named as not in the book');
ok(near(T4.H52, 843.73), 'tax ignores the utility pad, the kit and future proofing: still 843.73');
ok(near(P.ngTaxBase([{ bucket:'evse', row:'charger', mat:8000, lab:0 }, { bucket:'evse', row:'pedestal', mat:2300, lab:0 },
                     { bucket:'mr', row:'design', mat:0, lab:5692 }, { bucket:'mr', row:'trench', mat:1140, lab:4180 },
                     { bucket:'ne', row:'striping', mat:400, lab:190 }]).mat, 1540), 'tax base: make-ready material plus signage material, no EVSE, no labour');

console.log('5. the change table');
const submitted = [
  { desc:'Design', bucket:'mr', row:'design', qty:4, mat:0, lab:4000 },
  { desc:'Trench', bucket:'mr', row:'trench', qty:38, mat:1140, lab:3800 },
  { desc:'Chargers', bucket:'evse', row:'charger', qty:4, mat:8000, lab:0 }
];
R = P.ngPriceBook(job({ ports:4, paved:38, conduit:184, service:'three', submitted }));
const c10 = R.changes.find(c => c.row === 10), c12 = R.changes.find(c => c.row === 12), c27 = R.changes.find(c => c.row === 27);
ok(c10 && c10.submitted === 4000 && c10.corrected === 5692, 'row 10: 4,000 submitted, 5,692 corrected');
ok(c12 && c12.submitted === 4940 && c12.corrected === 5320, 'row 12: the $100 labour rate corrected to $110');
ok(!c27, 'row 27 already at the book: not listed');

console.log('6. the page is wired to it');
ok(/if\(form\.writer==='nationalgrid'\) mk=1;/.test(html) && !/ngFloorFactor/.test(html), 'no markup and no per-port floor on National Grid');
ok(/base:ngTaxBase, round:ngRound/.test(html), 'the form names the tax base and the rounding');
ok(/k:'ngService',\s*\n?\s*type2:'select', options:NG_SERVICE_OPTIONS/.test(html) && /k:'ng80PerPort'/.test(html), 'the service scope and the 80 A price are asked on the form');
ok(/if\(l\.util && form\.writer!=='nationalgrid'\) continue;/.test(html), 'utility-side rows stay off the proposal');
ok(/if\(l\.src==='ngbook'\) return false;/g.test(html) && (html.match(/if\(l\.src==='ngbook'\) return false;/g) || []).length === 2, 'book lines are never held out as unpriced civil or panel scope');
ok(/ngStationsFor\(num\(DATA\.plugs\)\)/.test(html), 'C7 is written as S');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
