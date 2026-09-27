/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The report's site map shows the equipment and not the application.

   Why (Thomas, 21 Hoosac St, 2026-09-26): the interactive report's Design
   section came out as the trench line on an empty parking lot — four
   chargers, a meter bank, a panel and four bollards were on the drawing and
   not on the picture — while the COMPASS, TERRAIN KEY and COORDINATES
   panels were. Patch 67 hides the UI chrome inside #sc for the duration of
   _captureFullCanvas() and had '.cel' on its list, which is the wrapper
   renderEl() builds round every placed element. It looked intermittent
   because a repaint during the async capture rebuilt the nodes visible.

   The whole Patch 67 script is cut out of editor.html and run against a
   small fake DOM, the same way tundoleg.js and ttrenchkeep.js grab code, so
   the test runs against what is in the file and not a copy. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'editor.html'), 'utf8');

let all = true;
function chk(l, ok, x) { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); if (!ok) all = false; return ok; }

/* ── cut the Patch 67 script out of the file ─────────────────────────── */
const MARK = 'OMEGA PATCH 67';
const hits = [];
for (let k = SRC.indexOf(MARK); k >= 0; k = SRC.indexOf(MARK, k + 1)) hits.push(k);
if (hits.length !== 1) throw new Error(MARK + ' appears ' + hits.length + ' times');
const open = SRC.lastIndexOf('<script>', hits[0]) + '<script>'.length;
const close = SRC.indexOf('</script>', hits[0]);
const CODE = SRC.slice(open, close);

/* ── a fake DOM: just enough for getElementById / querySelectorAll ───── */
function node(id, cls, children) {
  return { id: id || '', className: cls || '', style: { display: '' }, children: children || [] };
}
function walk(n, fn) { fn(n); n.children.forEach(c => walk(c, fn)); }
function hasClass(n, c) { return (' ' + n.className + ' ').indexOf(' ' + c + ' ') >= 0; }

/* The drawing as it stood on the screenshot: equipment, its guided-build
   icons, the conduit SVG, and the chrome that must not be on the report. */
const cels = [node('', 'cel'), node('', 'cel sel'), node('', 'cel cel-future'), node('', 'cel')];
const evgear = node('', 'evgear-node');
cels[0].children.push(evgear);
const coords = node('o2-coords');
const opCoords = node('op-o2-coords', 'op-panel', [coords]);
const tlKey = node('tl-key');
const opTl = node('op-tl-key', 'op-panel', [tlKey]);
const compass = node('omega-compass');
const legend = node('lgd');
const ruler = node('ruler');
const toast = node('', 'omega-toast');
const csvg = node('csvg');
const els = node('els', '', cels);
const sc = node('sc', '', [els, csvg, opCoords, opTl, compass, legend, ruler, toast]);
const root = node('', '', [sc]);

const document = {
  readyState: 'complete',
  addEventListener() {},
  getElementById(id) { let f = null; walk(root, n => { if (!f && n.id === id) f = n; }); return f; },
  querySelectorAll(sel) {
    const m = /^#sc \.([\w-]+)$/.exec(sel);
    if (!m) throw new Error('fake DOM cannot answer ' + sel);
    const out = [];
    walk(sc, n => { if (n !== sc && hasClass(n, m[1])) out.push(n); });
    return out;
  },
  querySelector() { return null; }
};

/* ── the editor globals the script touches ───────────────────────────── */
const seen = [];                 /* what the capture saw, per node */
function snapshot() {
  const s = {};
  s.cel = cels.map(c => c.style.display);
  s.evgear = evgear.style.display;
  s.csvg = csvg.style.display;
  s.chrome = [opCoords, opTl, compass, legend, ruler, toast].map(c => c.style.display);
  return s;
}
let mode = 'ok';
const win = {
  console: { info() {}, warn() {}, error() {} },
  setInterval(fn) { fn(); return 1; },       /* boot() polls; one tick is enough */
  clearInterval() {},
  document,
  _captureFullCanvas() {
    seen.push(snapshot());
    return mode === 'ok' ? Promise.resolve('data:image/jpeg;base64,xyz')
                         : Promise.reject(new Error('html2canvas failed'));
  }
};
win.window = win;
vm.createContext(win);
vm.runInContext(CODE, win, { filename: 'editor.html#patch67' });

/* ── assertions ──────────────────────────────────────────────────────── */
console.log('\nreport chrome (Patch 67 capture wrapper)\n');

chk('the script installs OmegaReportFix', !!win.OmegaReportFix && typeof win.OmegaReportFix.hideChrome === 'function');
chk('_captureFullCanvas is wrapped', win._captureFullCanvas.__clean === true);

const list = (win.OmegaReportFix.chromeClasses || []).concat(win.OmegaReportFix.overlays || []);
chk("'.cel' is on no hide list — it is the equipment", list.indexOf('.cel') < 0 && list.indexOf('cel') < 0, JSON.stringify(list));
chk("the CHROME_CLASSES source never names '.cel'", !/CHROME_CLASSES\s*=\s*\[[^\]]*\.cel/.test(CODE));

(async function () {
  const img = await win._captureFullCanvas();
  chk('the capture still returns its image', img === 'data:image/jpeg;base64,xyz', img);
  const s = seen[0];
  chk('every placed element was visible when the picture was taken', s.cel.every(d => d === ''), JSON.stringify(s.cel));
  chk('  and so was its guided-build icon', s.evgear === '', s.evgear);
  chk('  and the conduit / trench layer', s.csvg === '', s.csvg);
  chk('the COORDINATES and TERRAIN KEY frames, the compass, legend, ruler and toast were not',
      s.chrome.every(d => d === 'none'), JSON.stringify(s.chrome));
  chk('the chrome comes back after the capture',
      [opCoords, opTl, compass, legend, ruler, toast].every(c => c.style.display === ''),
      JSON.stringify([opCoords, opTl, compass, legend, ruler, toast].map(c => c.style.display)));
  chk('  and the equipment was never touched', cels.every(c => c.style.display === ''));

  /* A panel the user closed stays closed: hidden before, hidden after. */
  compass.style.display = 'none';
  await win._captureFullCanvas();
  chk('a panel already closed is left closed, not reopened', compass.style.display === 'none', compass.style.display);
  compass.style.display = '';

  /* A failed capture must not leave the editor with its panels gone. */
  mode = 'fail';
  let threw = false;
  try { await win._captureFullCanvas(); } catch (e) { threw = true; }
  chk('a failed capture rethrows', threw);
  chk('  and still restores the chrome',
      [opCoords, opTl, compass, legend, ruler, toast].every(c => c.style.display === ''));

  console.log(all ? '\nall passed\n' : '\nFAILED\n');
  process.exit(all ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
