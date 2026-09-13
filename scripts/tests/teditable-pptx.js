/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.join(__dirname,'../..');
const c={console,setTimeout,clearTimeout,setImmediate,Uint8Array,ArrayBuffer,Promise,TextEncoder,TextDecoder};
vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(root,'vendor/pptxgenjs-4.0.1.bundle.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(root,'omega-plot-editable.js'),'utf8'),c);
const api=c.OmegaEditablePlotPPT,m={a:1,b:0,c:0,d:1,e:0,f:0};
const p=api.path('M 10 20 l 30 0 v 25 h -30 z M 60 60 Q 70 40 80 60 C 90 80 100 40 110 60',m);
assert.equal(p[1].x,40);assert.equal(p[2].y,45);assert(p[4].close);assert(p[5].moveTo);
assert.equal(p[6].curve.type,'quadratic');assert.equal(p[7].curve.type,'cubic');
assert.throws(()=>api.path('M 0 0 A 5 5 0 0 0 10 10',m),/Unsupported/);
assert.throws(()=>api.path('M 0',m),/Invalid/);
const moved=api.path('M 1 2 L 3 4',{a:0,b:1,c:-1,d:0,e:20,f:10});
assert.equal(moved[0].x,18);assert.equal(moved[0].y,11);
const shape={name:'Grounding conductor',type:'shape',points:p,fill:null,stroke:'000000',alpha:1,fillAlpha:1,strokeAlpha:1,lineWidth:1,dash:false};
const text={name:'Editable note',type:'text',text:'Grounding conductor: engineer to specify',x:20,y:100,w:300,h:20,fontSize:12,fontFace:'Arial',fill:'000000',alpha:1,fillAlpha:1,rotate:0};
async function main(){
 const harness=require('./editor-harness');
 const app={window:{__ppWantPPTX:true},document:{getElementById:()=>null,getElementsByName:()=>[]},_cbChecked:()=>false,alert:()=>{}};
 harness.run(harness.fn('_ppExport'),app);
 await app._ppExport();
 assert.equal(app.window.__ppWantPPTX,false,'Failed export cannot redirect the next PDF export');
 assert.equal(app.window.__ppExportBusy,false,'Empty selection releases the export lock');
 const ppt=new c.PptxGenJS();assert.equal(ppt.ShapeType.custGeom,'custGeom');
 ppt.defineLayout({name:'TEST',width:17,height:11});ppt.layout='TEST';
 api.addObjects(ppt.addSlide(),{viewBox:[0,0,1632,1056],objects:[shape,text]},96);
 const bytes=await ppt.write({outputType:'uint8array'});
 const zip=await c.JSZip.loadAsync(bytes);
 const xml=await zip.file('ppt/slides/slide1.xml').async('string');
 assert(xml.includes('<a:custGeom>'));assert(xml.includes('<a:quadBezTo>'));assert(xml.includes('<a:cubicBezTo>'));
 assert(xml.includes('Grounding conductor: engineer to specify'));
 assert(xml.includes('name="Editable note"'));
 assert(!xml.includes('<p:pic>'),'Drawing must not be flattened into a picture');
 assert(!xml.includes('NaN'));
 const presentation=await zip.file('ppt/presentation.xml').async('string');
 assert(presentation.includes('cx="15544800" cy="10058400"'),'17 x 11 inch physical page');
 // A second export with the conductor removed leaves editable text intact.
 const revised=new c.PptxGenJS();revised.defineLayout({name:'TEST',width:17,height:11});revised.layout='TEST';
 api.addObjects(revised.addSlide(),{viewBox:[0,0,1632,1056],objects:[text]},96);
 const z2=await c.JSZip.loadAsync(await revised.write({outputType:'uint8array'}));
 const x2=await z2.file('ppt/slides/slide1.xml').async('string');
 assert(!x2.includes('<a:custGeom>'));assert(x2.includes('Editable note'));
 if(process.env.OMEGA_PPTX_TEST_OUTPUT)fs.writeFileSync(process.env.OMEGA_PPTX_TEST_OUTPUT,bytes);
 console.log('PASS: native editable PPTX geometry and text; quadratic/cubic paths; transforms; physical sheet size; object removal; unsupported-path rejection. Browser SVG compilation and PowerPoint application editing remain unverified.');
}
main().catch(e=>{console.error(e);process.exit(1);});
