/* The interconnection yard has to DRAW, not just exist in the model. */
const r = require('./render.js');
function chk(l,ok,x=''){ console.log(`  ${ok?'PASS':'FAIL'}  ${l}${x?'  '+x:''}`); return ok; }
let all = true;
const P = 6;

/* Exactly what AutoDesign pushes for the yard: engine equipment kinds,
   one point, footprint in feet, and a label. renderShape has no branch for
   any of these kinds and _shapeNode returns null for all of them. */
const yard = [
  { kind:'xfmr',  label:'MAIN TRANSFORMER', lf:20, wf:12, pts:[{x:100,y:100}] },
  { kind:'swgr',  label:'MV SWITCHGEAR',    lf:16, wf:8,  pts:[{x:100,y:190}] },
  { kind:'meter', label:'UTILITY METERING', lf:6,  wf:4,  pts:[{x:100,y:250}] },
  { kind:'pcs',   label:'BESS PCS SKID',    lf:14, wf:9,  pts:[{x:230,y:100}] }
];

let drewAll = true, labelled = 0;
const svg = [];
yard.forEach(sh => {
  const g = r.mk('g');
  r._renderFootprint(g, sh);
  if (!g.kids.length) { drewAll = false; return; }
  const rect = g.kids.filter(k => k.tag === 'rect')[0];
  const text = g.kids.filter(k => k.tag === 'text')[0];
  if (text) labelled++;
  const w = +rect.attrs.width, h = +rect.attrs.height;
  if (Math.abs(w - sh.lf*P) > 0.01 || Math.abs(h - sh.wf*P) > 0.01) drewAll = false;
  if (+rect.attrs.x !== sh.pts[0].x || +rect.attrs.y !== sh.pts[0].y) drewAll = false;
  svg.push(`<rect x="${rect.attrs.x}" y="${rect.attrs.y}" width="${w}" height="${h}" `
    + `fill="${rect.attrs.fill}" stroke="${rect.attrs.stroke}" stroke-width="1.4" rx="2"/>`);
  if (text) svg.push(`<text x="${text.attrs.x}" y="${text.attrs.y}" text-anchor="middle" `
    + `font-family="monospace" font-size="${text.attrs['font-size']}" `
    + `fill="${text.attrs.fill}">${text.textContent}</text>`);
});

all &= chk('every yard item draws a box at its true footprint', drewAll);
all &= chk('the ones with room are labelled', labelled >= 3, `${labelled} of 4`);

/* Every label must fit inside its own box. */
let overflow = null;
yard.forEach(sh => {
  const g = r.mk('g'); r._renderFootprint(g, sh);
  const rc = g.kids.filter(k=>k.tag==='rect')[0], tx = g.kids.filter(k=>k.tag==='text')[0];
  if (!tx) return;
  const wPx = +rc.attrs.width, need = tx.textContent.length * (+tx.attrs['font-size']) * 0.62;
  if (need > wPx) overflow = `${sh.label} needs ${need.toFixed(0)}px in a ${wPx}px box`;
});
all &= chk('no label overflows its box', !overflow, overflow || '');

/* A shape with no footprint must still draw nothing — the fallback is for
   things that know their size, not a catch-all that invents geometry. */
const g2 = r.mk('g');
r._renderFootprint(g2, { kind:'mystery', pts:[{x:0,y:0}] });
all &= chk('no footprint, no invention', g2.kids.length === 0);

/* A tiny item drops its label rather than drawing a smudge. */
const g3 = r.mk('g');
r._renderFootprint(g3, { kind:'meter', label:'M', lf:1, wf:0.5, pts:[{x:0,y:0}] });
all &= chk('a tiny item draws its box but no label',
  g3.kids.length === 1 && g3.kids[0].tag === 'rect');

require('fs').writeFileSync('yard-preview.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="330" viewBox="60 60 360 260">`
  + `<rect x="60" y="60" width="360" height="260" fill="#0d1a26"/>`
  + `<rect x="80" y="80" width="320" height="220" fill="none" stroke="#4ADE80" `
  + `stroke-width="1.6" stroke-dasharray="9 6"/>`
  + `<text x="240" y="76" text-anchor="middle" font-family="monospace" font-size="11" `
  + `fill="#4ADE80">INTERCONNECTION YARD</text>`
  + svg.join('') + `</svg>`);
console.log('\n  wrote yard-preview.svg');
console.log(all ? '\nALL PASS' : '\nFAILURES ABOVE');
process.exit(all?0:1);
