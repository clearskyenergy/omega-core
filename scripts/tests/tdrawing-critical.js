/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const assert=require('assert');
const h=require('./editor-harness');
const original={nodes:[{id:'existing'}],wires:[{from:'existing'}],sel:'existing',wireFrom:'existing'};
const c=h.run(h.fn('_sldGroupArrays')+'\n'+h.fn('sldFromSite'),{
  S:{shapes:[],elements:[],pxPerFt:2},_sld:original,confirm:()=>true,
  sldSetHint:msg=>{c.hint=msg;},sldRender:()=>{},
  _sldNew:(type,label,x,y)=>{const n={id:c._sld.nodes.length,type,label,x,y};c._sld.nodes.push(n);return n;},
  _sldWire:(a,b,label,type)=>c._sld.wires.push({from:a.id,to:b.id,label,type})
});
c.sldFromSite({replace:true});
assert.equal(c._sld.nodes[0].id,'existing');
assert.equal(c._sld.wires.length,1);
assert.equal(c._sld.sel,'existing');
c.S.shapes=[{kind:'solar',cx:10,cy:10,kw:500}];
c.sldFromSite({replace:true});
assert(c._sld.nodes.some(n=>n.type==='xfmr'&&n.label.includes('rating unverified')));
assert(!c._sld.nodes.some(n=>n.label.includes('526 kVA')));
assert(c.hint.includes('Concept topology'));
const ids=new Set(c._sld.nodes.map(n=>n.id));
assert(c._sld.wires.every(w=>ids.has(w.from)&&ids.has(w.to)));
let scale,arrows=0;
const p=h.run(h.fn('_ppRenderPlot'),{
  PP_SHEETS:{B:{w:17,h:11}},PP_DPI:100,
  window:{_ppCanvasCapture:'data:image/png;base64,AAAA',_ppCanvasCaptureW:900,_ppCanvasCaptureH:600},
  document:{getElementById:()=>({value:'Test site'})},
  _ppFindAssembly:()=>null,_ppNorthArrow:()=>{arrows++;return 'NORTH';},
  _ppTitleBlock:(W,H,tbW,tbH,num,name,street,s)=>{scale=s;return '<text>'+s+'</text>';}
});
for(const mode of ['wide','tight']){
  const svg=p._ppRenderPlot('B','Test site',mode);
  assert.equal(scale,'NTS');assert.equal(arrows,0);
  assert(svg.includes('NOT TO SCALE'));assert(svg.includes('data:image/png'));
  assert(!svg.includes('NaN'));assert(svg.endsWith('</svg>'));
}
console.log('PASS: preserve one-line on empty input; unverified transformer rating; valid generated endpoints; fitted plot captures marked NTS without assumed north.');
